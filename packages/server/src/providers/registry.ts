import {
  answerBoxes,
  boxAnswerKey,
  heuristicBoxReview,
  heuristicStageReview,
  type AnswerBox,
  type BoxReview,
  type ReplyFallback,
  type ReplySource,
  type ReviewFallbackReason,
  type ReviewedStage,
  type StageReview,
} from '@labguide/shared';
import type { ServerConfig } from '../config.js';
import { formatLesson, hintChoices, retrieveLesson } from '../lessons.js';
import { log } from '../logger.js';
import type { SpendMeter } from '../spend.js';
import type { Store } from '../store.js';
import { DeepSeekAdapter } from './deepseek.js';
import { DemoAdapter, LESSON_MISS, ruleSafetyReply } from './demo.js';
import { GeminiAdapter } from './gemini.js';
import { guardQuestions, guardTutorDraft } from './guard.js';
import { PoeAdapter } from './poe.js';
import { validateStageReview, validateTutorDraft } from './schema.js';
import {
  ProviderError,
  type StageReviewContext,
  type TutorDraft,
  type TutorProvider,
  type TutorTurnContext,
} from './types.js';

export interface BoxReviewResult {
  boxes: BoxReview[];
  passed: boolean;
  feedbackQuestions: string[];
  source: 'ai' | 'heuristic';
  fallbackReason?: ReviewFallbackReason;
}

export interface TurnResult {
  draft: TutorDraft;
  demo: boolean;
  provider: ReplySource;
  fallback?: ReplyFallback;
}

export type ReviewResult = Pick<StageReview, 'passed' | 'feedbackQuestions' | 'source' | 'fallbackReason'>;

const INJECTION =
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?|above|previous|everything)\b|\bsystem prompt\b|\byou are now\b|\b(mark|set|make|grade|score)\b.{0,30}\b(passed|pass|correct|full marks)\b|["']?passed["']?\s*[:=]\s*true|\bact as\b|\bjailbreak\b|<\/?\s*(system|student_data|assistant)\b/i;

export const INJECTION_QUESTION =
  'Your answer has words that are not about science. Can you remove them and write only your own idea?';

const GENERIC_QUESTION: Record<ReviewedStage, string> = {
  hypothesis: 'Does your sentence say what you change and what you look at?',
  variables: 'Can you name what you change, what you look at, and one thing you keep the same?',
  apparatus: 'Can you say, in a few words, what each item is for?',
  procedure: 'Can you write a few short steps for your test?',
  summary: 'Does your plan match your idea?',
};

function stageTexts(ctx: StageReviewContext): string[] {
  const p = ctx.plan;
  const all: Record<ReviewedStage, string[]> = {
    hypothesis: [p.hypothesis],
    variables: [p.variables.independent, p.variables.dependent, ...p.variables.controlled.map((c) => c.text)],
    apparatus: Object.values(p.apparatus.justifications),
    procedure: p.procedure.map((s) => s.text),
    summary: [],
  };
  all.summary = [p.theme.customTitle, ...all.hypothesis, ...all.variables, ...all.apparatus, ...all.procedure];
  return all[ctx.stage];
}

export function looksLikeInjection(ctx: StageReviewContext): boolean {
  return stageTexts(ctx).some((t) => INJECTION.test(t));
}

export class ProviderRegistry {
  readonly demo = new DemoAdapter();
  readonly poe: PoeAdapter;
  readonly gemini: GeminiAdapter;
  readonly deepseek: DeepSeekAdapter;
  private meter: SpendMeter;

  constructor(
    private cfg: ServerConfig,
    deps: { meter: SpendMeter; fetch?: typeof fetch; clock?: () => number },
  ) {
    this.poe = new PoeAdapter(cfg);
    this.gemini = new GeminiAdapter(cfg);
    this.deepseek = new DeepSeekAdapter(cfg, deps.meter, deps.fetch, deps.clock);
    this.meter = deps.meter;
  }

  /**
   * The server picks the provider: the admin setting if one was saved, otherwise the server
   * config (DeepSeek when DEEPSEEK_API_KEY exists, else Demo). The client cannot choose a
   * provider, upstream URL, model or system prompt. If the chosen real provider is not usable,
   * we stay in demo and say so; we never silently switch between real providers whose
   * privacy or billing behaviour differs.
   */
  active(store: Store): TutorProvider & { configured?: boolean } {
    const saved = store.data.providerConfig;
    const chosen = saved?.updatedAt ? saved.active : this.cfg.provider.active;
    if (!this.cfg.provider.allowlist.includes(chosen)) return this.demo;
    if (chosen === 'deepseek' && this.deepseek.configured) return this.deepseek;
    if (chosen === 'poe' && this.poe.configured) return this.poe;
    if (chosen === 'gemini' && this.gemini.configured) return this.gemini;
    return this.demo;
  }

  /** True when today's shared spend cap leaves no room for another paid call. */
  async budgetReached(store: Store): Promise<boolean> {
    if (this.active(store) !== this.deepseek) return false;
    return this.meter.exhausted(this.deepseek.minCallUsd);
  }

  /** Timeouts, bounded retries and output validation around any provider call. */
  private async attempt<T>(
    call: (signal: AbortSignal) => Promise<unknown>,
    validate: (raw: unknown) => T,
    opts: { simulateError?: boolean; deadline?: number } = {},
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.cfg.provider.maxRetries; attempt++) {
      const left = (opts.deadline ?? Infinity) - Date.now();
      if (attempt > 0 && left < 3000) break;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), Math.min(this.cfg.provider.timeoutMs, Math.max(1000, left)));
      try {
        if (opts.simulateError) {
          throw new ProviderError('Simulated provider outage (Demo mode).', true, 'unavailable');
        }
        return validate(await call(ac.signal));
      } catch (err) {
        lastErr = err;
        if (err instanceof ProviderError && !err.retryable) break;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastErr instanceof ProviderError) throw lastErr;
    throw new ProviderError('The tutor is not available right now.', true, 'unavailable');
  }

  async sendTurn(
    store: Store,
    ctx: TutorTurnContext,
    opts: { simulateError?: boolean } = {},
  ): Promise<TurnResult> {
    const provider = this.active(store);
    const lesson = retrieveLesson(ctx.plan.theme.theme);
    const lessonText = formatLesson(ctx.plan.theme.theme, ctx.stage);
    const turn: TutorTurnContext = { ...ctx, lessonText };
    const stamp = (draft: TutorDraft): TutorDraft => (lesson ? { ...draft, practical: lesson.practical } : draft);

    // Hint 3 is three choices from the lesson brief. The model does not write them.
    if (ctx.request.type === 'hint' && ctx.hintLevel === 3 && !ruleSafetyReply(ctx)) {
      const choices = hintChoices(ctx.plan.theme.theme, ctx.stage);
      if (!choices) {
        return {
          draft: validateTutorDraft({
            kind: 'hint',
            hintLevel: 3,
            text: LESSON_MISS,
            questions: ['What will you change, and what will you look at?'],
          }),
          demo: true,
          provider: 'demo',
          ...(provider.demo ? {} : { fallback: 'retrieval' as const }),
        };
      }
      return {
        draft: stamp({
          ...validateTutorDraft({
            kind: 'hint',
            hintLevel: 3,
            text: 'Pick the best sentence for this practical.',
            questions: [],
          }),
          choices,
        }),
        demo: provider.demo,
        provider: provider.demo ? 'demo' : 'rules',
      };
    }

    if (provider.demo) {
      const draft = stamp(await this.attempt((s) => provider.sendTurn(turn, s), validateTutorDraft, opts));
      return { draft, demo: true, provider: 'demo' };
    }

    // Deterministic safety rules always come first and are never handed to a model.
    const safety = ruleSafetyReply(ctx);
    if (safety) return { draft: validateTutorDraft(safety), demo: false, provider: 'rules' };

    // A chosen practical with no brief must not be handed to the model.
    if (ctx.plan.theme.theme && !lesson) {
      log.warn('tutor_fallback_to_demo', { reason: 'retrieval' });
      const draft = validateTutorDraft({
        kind: ctx.request.type === 'hint' ? 'hint' : ctx.request.type === 'enter' ? 'greeting' : 'socratic',
        hintLevel: ctx.request.type === 'hint' ? ctx.hintLevel : undefined,
        text: LESSON_MISS,
        questions: ['What will you change, and what will you look at?'],
      });
      return { draft, demo: true, provider: 'demo', fallback: 'retrieval' };
    }

    const leakCtx = {
      plan: ctx.plan,
      stage: ctx.stage,
      hintLevel: ctx.request.type === 'hint' ? ctx.hintLevel : undefined,
      studentMessages: ctx.history.filter((m) => m.role === 'student').map((m) => m.text),
    };
    try {
      const draft = await this.attempt(
        (s) => provider.sendTurn(turn, s),
        (raw) => guardTutorDraft(validateTutorDraft(raw), leakCtx),
        opts,
      );
      if (ctx.request.type === 'hint') Object.assign(draft, { kind: 'hint', hintLevel: ctx.hintLevel });
      if (/\b(toy car|pendulum|ramp)\b/i.test(`${draft.text} ${draft.questions.join(' ')}`)) {
        throw new ProviderError('Reply invented a different experiment', true, 'invalid_output');
      }
      return { draft: stamp(draft), demo: false, provider: 'deepseek' };
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : 'unavailable';
      if (code === 'budget' || code === 'invalid_output') {
        log.warn('tutor_fallback_to_demo', { reason: code });
        const draft = stamp(validateTutorDraft(await this.demo.sendTurn(turn)));
        return { draft, demo: true, provider: 'demo', fallback: code === 'budget' ? 'budget' : 'invalid_output' };
      }
      throw err;
    }
  }

  /**
   * One DeepSeek call per card, after the easy S1–S2 check. A simple on-topic card passes
   * without a call. If the cap is hit or a call fails, the remaining cards use the fixed check.
   */
  async reviewAnswerBoxes(
    store: Store,
    ctx: StageReviewContext,
    prior: BoxReview[] | undefined,
    deadline: number,
  ): Promise<BoxReviewResult> {
    const boxes = answerBoxes(ctx.plan, ctx.stage);
    const lessonText = formatLesson(ctx.plan.theme.theme, ctx.stage);
    const provider = this.active(store);
    const theme = ctx.plan.theme.theme;
    const out: BoxReview[] = [];
    let stopAi: ReviewFallbackReason | null = null;
    const reviewedAt = new Date().toISOString();

    const fixed = (box: AnswerBox, reason: ReviewFallbackReason): BoxReview => {
      const easy = heuristicBoxReview(ctx.plan, box);
      return {
        id: box.id,
        passed: easy.passed,
        question: easy.passed ? '' : (easy.feedbackQuestions[0] ?? 'What does this card say about your test?'),
        source: 'heuristic',
        ...(easy.passed ? {} : { fallbackReason: reason }),
        answerKey: boxAnswerKey(theme, box.id, box.text),
        reviewedAt,
      };
    };

    for (const box of boxes) {
      const key = boxAnswerKey(theme, box.id, box.text);
      const old = prior?.find((b) => b.id === box.id && b.answerKey === key);
      if (old && (old.passed || old.source === 'ai')) {
        out.push(old);
        continue;
      }
      if (INJECTION.test(box.text)) {
        out.push({
          id: box.id,
          passed: false,
          question: INJECTION_QUESTION,
          source: 'heuristic',
          fallbackReason: 'suspicious_input',
          answerKey: key,
          reviewedAt,
        });
        continue;
      }
      const easy = heuristicBoxReview(ctx.plan, box);
      if (easy.passed) {
        out.push({ id: box.id, passed: true, question: '', source: 'heuristic', answerKey: key, reviewedAt });
        continue;
      }
      const reasonNow = (): ReviewFallbackReason | null => {
        if (stopAi) return stopAi;
        if (provider.demo) return 'not_configured';
        if (!lessonText) return 'retrieval';
        if (deadline - Date.now() < 3000) return 'unavailable';
        return null;
      };
      let reason = reasonNow();
      if (!reason && (await this.budgetReached(store))) reason = 'budget';
      if (reason) {
        if (reason === 'budget' || reason === 'unavailable') stopAi = reason;
        out.push(fixed(box, reason));
        continue;
      }
      try {
        const review = await this.attempt(
          (s) => provider.reviewPlan({ ...ctx, box, lessonText }, s),
          validateStageReview,
          { deadline },
        );
        if (review.passed) {
          out.push({ id: box.id, passed: true, question: '', source: 'ai', answerKey: key, reviewedAt });
          continue;
        }
        let question = guardQuestions(review.feedbackQuestions, { plan: ctx.plan, stage: ctx.stage })[0];
        if (!question) question = easy.feedbackQuestions[0] ?? GENERIC_QUESTION[ctx.stage];
        out.push({ id: box.id, passed: false, question, source: 'ai', answerKey: key, reviewedAt });
      } catch (err) {
        const code = err instanceof ProviderError ? err.code : 'unavailable';
        const mapped: ReviewFallbackReason = code === 'budget' ? 'budget' : code === 'invalid_output' ? 'invalid_output' : 'unavailable';
        stopAi = mapped === 'invalid_output' ? 'unavailable' : mapped;
        log.warn('review_fallback_to_heuristics', { reason: code, box: box.id });
        out.push(fixed(box, mapped));
      }
    }

    const failed = out.filter((b) => !b.passed);
    const passed = boxes.length === 0 || failed.length === 0;
    const feedbackQuestions = [...new Set(failed.map((b) => b.question).filter(Boolean))].slice(0, 3);
    const failedHeuristic = failed.some((b) => b.source === 'heuristic');
    const source = !failedHeuristic && out.some((b) => b.source === 'ai') ? 'ai' : 'heuristic';
    const fallbackReason = passed ? undefined : failed.find((b) => b.fallbackReason)?.fallbackReason;
    return { boxes: out, passed, feedbackQuestions, source, fallbackReason };
  }

  /**
   * Quality review of one stage, run only after the deterministic rules and safety blocks pass.
   * The S1–S2 checks are a pass the model cannot overturn: a simple on-topic idea moves on.
   * The model is asked only when those checks fail, and it uses the same easier bar.
   * When the model is not available, the same checks decide and the result says so.
   * Safety blocks are applied earlier and are never relaxed here.
   */
  async reviewStage(store: Store, ctx: StageReviewContext, deadline: number): Promise<ReviewResult> {
    if (looksLikeInjection(ctx)) {
      return { passed: false, feedbackQuestions: [INJECTION_QUESTION], source: 'heuristic', fallbackReason: 'suspicious_input' };
    }
    const easy = heuristicStageReview(ctx.plan, ctx.stage);
    if (easy.passed) return { passed: true, feedbackQuestions: [], source: 'heuristic' };
    const heuristic = (reason: ReviewFallbackReason): ReviewResult => ({
      ...easy,
      source: 'heuristic',
      fallbackReason: reason,
    });
    const provider = this.active(store);
    const lessonText = formatLesson(ctx.plan.theme.theme, ctx.stage);
    if (provider.demo) return heuristic('not_configured');
    if (ctx.plan.theme.theme && !lessonText) return heuristic('retrieval');
    if (deadline - Date.now() < 3000) return heuristic('unavailable');
    try {
      const review = await this.attempt((s) => provider.reviewPlan({ ...ctx, lessonText }, s), validateStageReview, { deadline });
      if (review.passed) return { passed: true, feedbackQuestions: [], source: 'ai' };
      let questions = guardQuestions(review.feedbackQuestions, { plan: ctx.plan, stage: ctx.stage });
      if (!questions.length) questions = heuristicStageReview(ctx.plan, ctx.stage).feedbackQuestions;
      if (!questions.length) questions = [GENERIC_QUESTION[ctx.stage]];
      return { passed: false, feedbackQuestions: questions, source: 'ai' };
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : 'unavailable';
      log.warn('review_fallback_to_heuristics', { reason: code });
      return heuristic(code === 'budget' ? 'budget' : code === 'invalid_output' ? 'invalid_output' : 'unavailable');
    }
  }
}
