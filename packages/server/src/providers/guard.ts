import {
  THEME_KEYWORDS,
  apparatusName,
  contentWords,
  hasUnnegated,
  normalise,
  type AppStage,
  type Plan,
  type ThemeId,
} from '@labguide/shared';
import { log } from '../logger.js';
import { ProviderError, type TutorDraft } from './types.js';

/**
 * Typical model answers for each theme. If a reply shares a phrase with these that the
 * student has not written themselves, the model is probably writing the answer for them.
 */
export const ANSWER_TEMPLATES: Record<Exclude<ThemeId, 'custom'>, string[]> = {
  photosynthesis: [
    'if the light intensity increases then the rate of photosynthesis will increase',
    'the closer the lamp is to the pondweed the more bubbles are produced per minute',
    'as the distance of the lamp from the pondweed increases the number of bubbles per minute will decrease',
    'the independent variable is the light intensity or the distance of the lamp from the pondweed',
    'the dependent variable is the number of bubbles per minute or the volume of oxygen produced',
    'keep the temperature of the water the type of pondweed and the amount of sodium hydrogencarbonate the same',
    'measure the distance between the lamp and the pondweed with a metre rule',
    'count the number of bubbles produced in one minute',
  ],
  enzyme: [
    'if the temperature increases then the enzyme activity will increase until the optimum temperature',
    'as the temperature increases the volume of oxygen produced will increase',
    'the independent variable is the temperature or the ph of the hydrogen peroxide',
    'the dependent variable is the volume of oxygen produced or the height of the foam',
    'keep the volume and concentration of hydrogen peroxide and the mass of potato the same',
    'collect the oxygen in a gas syringe and record the volume every 30 seconds',
  ],
  dissolving: [
    'if the temperature of the water increases then the sugar will dissolve faster',
    'as the temperature increases the time taken for the sugar to dissolve will decrease',
    'the independent variable is the temperature of the water or the particle size',
    'the dependent variable is the time taken for the solute to dissolve completely',
    'keep the volume of water the mass of sugar and the rate of stirring the same',
    'add the sugar to the water and start the stopwatch at the same time',
  ],
  insulation: [
    'if the insulating material is thicker then the water will cool more slowly',
    'as the number of layers increases the temperature of the water will drop more slowly',
    'the independent variable is the type of insulating material or the number of layers',
    'the dependent variable is the temperature drop of the water after ten minutes',
    'keep the volume of hot water the starting temperature and the size of the beaker the same',
    'record the temperature of the water every minute for ten minutes',
  ],
  'iodine-starch': [
    'if starch is present then iodine solution changes from brown to blue-black',
    'iodine added to water stays brown and iodine added to starch solution turns blue-black',
  ],
  'leaf-starch': [
    'a green leaf that has been in the light contains starch so it turns blue-black with iodine',
    'boil the leaf in water then warm it in hot alcohol with the burner off before adding iodine',
  ],
  'oxygen-plant': [
    'the gas collected from the water plant is oxygen because a glowing splint relights',
    'the teacher tests the gas with a glowing splint after the plant has been in bright light',
  ],
  'light-needed': [
    'light is needed for photosynthesis because only the uncovered part of the leaf contains starch',
    'the part of the leaf covered with aluminium foil is the control and stays brown with iodine',
  ],
  'chlorophyll-needed': [
    'chlorophyll is needed because only the green part of a variegated leaf contains starch',
    'the non-green part of the variegated leaf is the control and does not turn blue-black',
  ],
  'carbon-dioxide-needed': [
    'carbon dioxide is needed because the leaf left in normal air contains starch and the leaf with soda lime does not',
    'the teacher handles the soda lime and students wear eye protection and do not touch it',
  ],
};

/** Words a tutor uses about any plan. They never make a sentence "new content". */
const TUTOR_WORDS = new Set(
  ('hypothesis prediction predict variable variables independent dependent controlled control fair test measure measured ' +
    'measuring measurement change changes changed keep think thinking good great well done chose choose choice reason ' +
    'reasons because idea ideas answer answers plan step steps method procedure apparatus result results classmate ' +
    'teacher school laboratory clear clearer exactly exact detail details write wrote written explain describe ' +
    'try again next first last hint example topic different stage check unit units precise precisely reliable ' +
    'record repeat safety safe help question questions look read thing things something word words part parts')
    .split(' '),
);

const HYPOTHESIS_FORM =
  /\bif\b.{3,}?\bthen\b.{3,}|\bas\b.{2,}?\b(increases?|decreases?|changes?|goes up|goes down|rises?|falls?|gets? \w+)\b.*?\bwill\b|\bthe (more|less|closer|further|higher|lower|bigger|smaller|hotter|colder|warmer|thicker|thinner)\b.{2,}?,?\s*the (more|less|faster|slower|higher|lower|bigger|smaller|longer|shorter)\b|\b(i|we|you) (predict|expect)\b.{3,}\bwill\b/i;
const VARIABLE_ASSIGNMENT =
  /\b(your|the|a|one|good|possible)\s+(independent|dependent|controlled|control)\s+variables?\s+(is|are|was|could be|should be|would be|will be|might be|can be|includes?|=|:)/i;
const WRITE_FOR_YOU =
  /\b(you (could|can|should|might) (write|say|put|use the sentence|answer)|try writing|write (this|it as|something like)|here is (your|a|an|the) (hypothesis|method|procedure|answer|plan|justification)|(a|an|one) (good|better|possible|sample|model) (hypothesis|answer|method|justification) (is|would be|could be|might be)|your (hypothesis|answer|method|procedure|justification|reason) (could|should|would|might|can) (be|say|read|look like))\b/i;
const NUMBERED_STEP = /(?:^|\s)(?:step\s*)?\d{1,2}\s*[.):]\s+\S/gi;
const HOME = /\b(at home|in your (home|house|kitchen|bedroom|bathroom)|home experiment|try (this|it) at home|your own home)\b/i;

export type LeakReason =
  | 'hypothesis_form'
  | 'variable_assignment'
  | 'write_for_you'
  | 'numbered_steps'
  | 'template_overlap'
  | 'justification'
  | 'home_experiment';

export interface LeakContext {
  plan: Plan;
  stage: AppStage;
  hintLevel?: number;
  /** The student's own chat messages: words they already used are not new content. */
  studentMessages?: string[];
}

function studentText(ctx: LeakContext): string {
  const p = ctx.plan;
  return [
    p.theme.customTitle,
    p.hypothesis,
    p.variables.independent,
    p.variables.dependent,
    ...p.variables.controlled.map((c) => c.text),
    ...Object.values(p.apparatus.justifications),
    ...p.procedure.map((s) => s.text),
    ...(ctx.studentMessages ?? []),
  ].join(' \n ');
}

function topicVocabulary(ctx: LeakContext): string[] {
  const p = ctx.plan;
  const theme = p.theme.theme;
  const words = new Set<string>(theme && theme !== 'custom' ? THEME_KEYWORDS[theme] : []);
  for (const w of contentWords(`${p.theme.customTitle} ${p.variables.independent} ${p.variables.dependent}`)) words.add(w);
  for (const id of p.apparatus.selected) words.add(apparatusName(id).toLowerCase());
  return [...words];
}

function topicHits(text: string, vocab: string[]): number {
  const t = ` ${normalise(text)} `;
  return vocab.filter((w) => (w.length <= 3 ? t.includes(` ${w} `) : t.includes(w))).length;
}

function novelWords(text: string, known: Set<string>): string[] {
  return contentWords(text).filter((w) => !known.has(w) && !TUTOR_WORDS.has(w) && !known.has(w.replace(/s$/, '')));
}

function shingles(text: string, n = 4): Set<string> {
  const words = normalise(text).replace(/[^a-z0-9³° ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) {
    const gram = words.slice(i, i + n);
    if (contentWords(gram.join(' ')).length >= 2) out.add(gram.join(' '));
  }
  return out;
}

export class AnswerLeakChecker {
  private vocab: string[];
  private known: Set<string>;
  private studentGrams: Set<string>;
  private templateGrams: Set<string>;
  private exampleAllowed: boolean;

  constructor(private ctx: LeakContext) {
    const own = studentText(ctx);
    this.vocab = topicVocabulary(ctx);
    this.known = new Set(contentWords(own));
    this.studentGrams = shingles(own);
    const theme = ctx.plan.theme.theme;
    this.templateGrams = new Set(theme && theme !== 'custom' ? ANSWER_TEMPLATES[theme].flatMap((t) => [...shingles(t)]) : []);
    this.exampleAllowed = ctx.hintLevel === 3;
  }

  /** Why this sentence writes part of the student's answer, or null when it is safe. */
  check(sentence: string): LeakReason | null {
    const hits = topicHits(sentence, this.vocab);
    const novel = novelWords(sentence, this.known);
    // A worked example on a DIFFERENT topic (hint 3) does not touch the student's topic at all.
    const offTopicExample = this.exampleAllowed && hits === 0;

    if (hasUnnegated(sentence, HOME)) return 'home_experiment';
    if (HYPOTHESIS_FORM.test(sentence) && hits >= 1 && novel.length >= 1 && !offTopicExample) return 'hypothesis_form';
    if (VARIABLE_ASSIGNMENT.test(sentence) && novel.length >= 1 && !offTopicExample) return 'variable_assignment';
    if (WRITE_FOR_YOU.test(sentence) && !offTopicExample) return 'write_for_you';
    for (const g of shingles(sentence)) {
      if (this.templateGrams.has(g) && !this.studentGrams.has(g)) return 'template_overlap';
    }
    if (!sentence.trim().endsWith('?') && /\bbecause\b/i.test(sentence)) {
      const item = this.ctx.plan.apparatus.selected.find((id) => normalise(sentence).includes(apparatusName(id).toLowerCase()));
      if (item) {
        const reason = sentence.split(/\bbecause\b/i).slice(1).join(' ');
        const own = new Set(contentWords(this.ctx.plan.apparatus.justifications[item] ?? ''));
        const added = contentWords(reason).filter((w) => !own.has(w) && !TUTOR_WORDS.has(w));
        if (added.length >= 2) return 'justification';
      }
    }
    return null;
  }

  /** Numbered method steps about the student's topic (a different-topic example is fine at hint 3). */
  numberedSteps(text: string): boolean {
    const steps = text.match(NUMBERED_STEP) ?? [];
    if (steps.length < 2) return false;
    return !(this.exampleAllowed && topicHits(text, this.vocab) === 0);
  }
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Repairs a tutor reply by removing every sentence or question that writes the student's
 * answer or suggests a home experiment. Rejects it (so the safe template is used) when the
 * leak cannot be cut out cleanly or nothing useful is left.
 */
export function guardTutorDraft(draft: TutorDraft, ctx: LeakContext): TutorDraft {
  const checker = new AnswerLeakChecker(ctx);
  const all = [draft.text, ...draft.questions].join('\n');
  if (checker.numberedSteps(all)) {
    log.warn('tutor_output_rejected', { reason: 'numbered_steps', stage: ctx.stage });
    throw new ProviderError('Reply wrote method steps', true, 'invalid_output');
  }
  const reasons: LeakReason[] = [];
  const keep = (s: string) => {
    const r = checker.check(s);
    if (r) reasons.push(r);
    return !r;
  };
  const text = splitSentences(draft.text).filter(keep).join(' ');
  const questions = draft.questions.filter(keep);
  if (reasons.length) log.warn('tutor_output_repaired', { reasons, stage: ctx.stage });
  if (!text && !questions.length) throw new ProviderError('Nothing safe left in reply', true, 'invalid_output');
  if (reasons.length && !questions.length && draft.questions.length) {
    throw new ProviderError('All guiding questions leaked the answer', true, 'invalid_output');
  }
  return { ...draft, text, questions };
}

/** Drops feedback questions that give the answer away. */
export function guardQuestions(questions: string[], ctx: LeakContext): string[] {
  const checker = new AnswerLeakChecker(ctx);
  const kept = questions.filter((q) => !checker.check(q) && !checker.numberedSteps(q));
  if (kept.length !== questions.length) log.warn('review_questions_repaired', { removed: questions.length - kept.length });
  return kept;
}
