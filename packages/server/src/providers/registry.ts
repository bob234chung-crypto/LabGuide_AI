import {
  heuristicStageReview,
  type ReplyFallback,
  type ReplySource,
  type ReviewFallbackReason,
  type ReviewedStage,
  type StageReview,
} from '@labguide/shared';
import type { ServerConfig } from '../config.js';
import { log } from '../logger.js';
import type { SpendMeter } from '../spend.js';
import type { Store } from '../store.js';
import { DeepSeekAdapter } from './deepseek.js';
import { DemoAdapter, ruleSafetyReply } from './demo.js';
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
    if (provider.demo) {
      const draft = await this.attempt((s) => provider.sendTurn(ctx, s), validateTutorDraft, opts);
      return { draft, demo: true, provider: 'demo' };
    }

    // Deterministic safety rules always come first and are never handed to a model.
    const safety = ruleSafetyReply(ctx);
    if (safety) return { draft: validateTutorDraft(safety), demo: false, provider: 'rules' };

    const leakCtx = {
      plan: ctx.plan,
      stage: ctx.stage,
      hintLevel: ctx.request.type === 'hint' ? ctx.hintLevel : undefined,
      studentMessages: ctx.history.filter((m) => m.role === 'student').map((m) => m.text),
    };
    try {
      const draft = await this.attempt(
        (s) => provider.sendTurn(ctx, s),
        (raw) => guardTutorDraft(validateTutorDraft(raw), leakCtx),
        opts,
      );
      if (ctx.request.type === 'hint') Object.assign(draft, { kind: 'hint', hintLevel: ctx.hintLevel });
      return { draft, demo: false, provider: 'deepseek' };
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : 'unavailable';
      if (code === 'budget' || code === 'invalid_output') {
        log.warn('tutor_fallback_to_demo', { reason: code });
        const draft = validateTutorDraft(await this.demo.sendTurn(ctx));
        return { draft, demo: true, provider: 'demo', fallback: code === 'budget' ? 'budget' : 'invalid_output' };
      }
      throw err;
    }
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
    if (provider.demo) return heuristic('not_configured');
    if (deadline - Date.now() < 3000) return heuristic('unavailable');
    try {
      const review = await this.attempt((s) => provider.reviewPlan(ctx, s), validateStageReview, { deadline });
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
