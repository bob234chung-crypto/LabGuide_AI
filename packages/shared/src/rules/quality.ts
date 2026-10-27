import { apparatusName, getApparatus } from '../apparatus.js';
import type { AnswerBox, Plan, ReviewedStage, ThemeId } from '../types.js';
import { normalise } from './text.js';

/** Words that place a sentence on a theme's topic. Also used to spot answers written by a model. */
export const THEME_KEYWORDS: Record<Exclude<ThemeId, 'custom'>, string[]> = {
  photosynthesis: [
    'photosynthesis', 'light', 'lamp', 'pondweed', 'elodea', 'bubbles', 'oxygen', 'carbon dioxide',
    'hydrogencarbonate', 'light intensity', 'distance', 'plant', 'leaf', 'leaves', 'chlorophyll',
  ],
  enzyme: [
    'enzyme', 'catalase', 'hydrogen peroxide', 'peroxide', 'potato', 'liver', 'amylase', 'starch',
    'iodine', 'substrate', 'foam', 'oxygen', 'ph', 'denature',
  ],
  dissolving: [
    'dissolve', 'dissolves', 'dissolving', 'solubility', 'soluble', 'solute', 'solvent', 'sugar', 'salt',
    'stir', 'stirring', 'particle', 'granules', 'cube', 'crystals',
  ],
  insulation: [
    'insulation', 'insulator', 'insulating', 'heat loss', 'cotton wool', 'foil', 'bubble wrap', 'newspaper',
    'layers', 'thickness', 'cool', 'cools', 'cooling', 'lid', 'hot water',
  ],
  'iodine-starch': [
    'iodine', 'starch', 'blue-black', 'brown', 'colour', 'color', 'spotting', 'tile', 'water',
  ],
  'leaf-starch': [
    'leaf', 'leaves', 'starch', 'iodine', 'alcohol', 'ethanol', 'green', 'chlorophyll', 'boil', 'water',
  ],
  'oxygen-plant': [
    'oxygen', 'water plant', 'plant', 'gas', 'splint', 'bubbles', 'light', 'hydrogencarbonate', 'funnel',
  ],
  'light-needed': [
    'light', 'dark', 'foil', 'aluminium', 'aluminum', 'starch', 'leaf', 'leaves', 'iodine', 'covered',
    'photosynthesis',
  ],
  'chlorophyll-needed': [
    'chlorophyll', 'green', 'variegated', 'starch', 'leaf', 'leaves', 'iodine', 'white', 'photosynthesis',
  ],
  'carbon-dioxide-needed': [
    'carbon dioxide', 'co2', 'starch', 'leaf', 'leaves', 'soda lime', 'iodine', 'air', 'photosynthesis',
  ],
};

const STOPWORDS = new Set(
  ('a an the and or of to in on at for with by from as is are be will would can could should do does did it its this that ' +
    'these those then than if when what which who how why my your our their his her we you they i me them so not no yes ' +
    'more less same each every one two three into onto over under up down out about after before because while also just ' +
    'very much many some any all use used using make made get got have has had per')
    .split(' '),
);

/** Lower-case content words (4+ letters, no stopwords). */
export function contentWords(text: string): string[] {
  return normalise(text)
    .split(/[^a-z0-9°³]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Vague praise words. "Work" is allowed: junior students say "the enzyme will work". */
const VAGUE = /\b(better|best|good|nice|stuff|thing|things|something|affect it|affects it)\b/i;
/**
 * Something the student can look at. Direction words (faster, slower, more) are not required.
 * "Photosynthesis" and "enzyme" count, so "carbon dioxide … photosynthesis rate" is enough.
 * "Starch" counts, so a leaf test can name starch instead of a rate.
 */
const LOOK_AT =
  /\b(rate|rates|bubble|bubbles|oxygen|starch|time|times|minute|minutes|second|seconds|colour|color|number|amount|temperature|mass|volume|height|length|distance|speed|ph|count|counts|gas|foam|dissolve|dissolves|dissolving|cool|cools|cooling|photosynthesis|enzyme|enzymes|insulation|sugar|salt|rust|rusts|rusting|grow|grows|growing|hotter|colder|warmer)\b/i;

/** These practicals ask whether a factor is needed. The sentence must name that factor and starch. */
function starchPractical(theme: ThemeId | null, text: string): boolean | null {
  if (theme === 'oxygen-plant') {
    return /\boxygen\b/i.test(text) && /\b(plant|water|gas|light|bubbles?|splint)\b/i.test(text);
  }
  const factor: Partial<Record<ThemeId, RegExp>> = {
    'iodine-starch': /\b(iodine|water|brown|blue|colour|color)\b/i,
    'leaf-starch': /\b(leaf|leaves|green)\b/i,
    'light-needed': /\b(light|dark|foil|aluminium|aluminum|covered|uncovered|sunlight|sun)\b/i,
    'chlorophyll-needed': /\b(chlorophyll|green|variegated|white|pale)\b/i,
    'carbon-dioxide-needed': /carbon dioxide|\bco2\b/i,
  };
  const words = theme ? factor[theme] : undefined;
  if (!words) return null;
  return /\bstarch\b/i.test(text) && words.test(text);
}
const NON_ANSWER =
  /^(i\s*do\s*n['’]?t\s*know|i\s*dont\s*know|idk|no\s*idea|dunno|not\s*sure|i'?m\s*not\s*sure|i\s*am\s*not\s*sure|unsure|no|yes|ok|okay|n\/?a|none|nil|nothing|don'?t\s*know|\?+)$/i;
const EMPTY_CONTROL = /^(everything|all|same|the same|nothing|none|everything else|all the same|other things|n\/?a)$/i;
const FILLER = new Set(['useful', 'helpful', 'good', 'nice', 'important', 'needed', 'okay', 'thing', 'stuff', 'because']);

export interface QualityResult {
  passed: boolean;
  feedbackQuestions: string[];
}

function topicWords(plan: Plan): string[] {
  const theme = plan.theme.theme;
  if (!theme) return [];
  if (theme === 'custom') return contentWords(plan.theme.customTitle);
  return THEME_KEYWORDS[theme];
}

function mentionsAny(text: string, words: string[]): boolean {
  const t = ` ${normalise(text)} `;
  return words.some((w) => t.includes(w.length <= 3 ? ` ${w} ` : w));
}

/** "I don't know" with no real idea attached. A hedged sentence that still names the test can pass. */
export function isNonAnswer(text: string): boolean {
  const t = normalise(text).replace(/[.!?]+$/g, '').trim();
  if (!t) return true;
  if (NON_ANSWER.test(t)) return true;
  const rest = t
    .replace(/^(i\s*)?(do\s*n['’]?t|dont)\s*know\b[,.\s]*/i, '')
    .replace(/^(idk|no idea|dunno)\b[,.\s]*/i, '')
    .trim();
  return rest !== t && contentWords(rest).length < 2;
}

function onTopic(plan: Plan, text: string): boolean {
  const topic = topicWords(plan);
  if (!topic.length) return contentWords(text).length >= 2;
  return mentionsAny(text, topic);
}

/** A short lab word is enough. Precise terms and units are not required. */
function aboutExperiment(plan: Plan, text: string): boolean {
  if (isNonAnswer(text)) return false;
  if (onTopic(plan, text) || LOOK_AT.test(text)) return true;
  return contentWords(text).length >= 1 && topicWords(plan).length === 0;
}

/**
 * A simple idea: what they change and what they look at.
 * Weak grammar is fine. Words like faster or slower are not required.
 */
function namesChangeAndLook(plan: Plan, text: string): boolean {
  if (contentWords(text).length < 2) return false;
  const paired = starchPractical(plan.theme.theme, text);
  if (paired !== null) return paired;
  if (LOOK_AT.test(text)) return true;
  return plan.theme.theme === 'custom';
}

function hypothesisQuestions(plan: Plan): string[] {
  const text = plan.hypothesis.trim();
  if (!text || isNonAnswer(text)) return ['What will you change, and what will you look at?'];
  if (!onTopic(plan, text)) return ['How does your idea fit this experiment?'];
  if (VAGUE.test(text) && !LOOK_AT.test(text)) return ['What will you look at in your test?'];
  if (!namesChangeAndLook(plan, text)) return ['What will you change, and what will you look at?'];
  return [];
}

function variablesQuestions(plan: Plan): string[] {
  const v = plan.variables;
  const q: string[] = [];
  const iv = v.independent.trim();
  const dv = v.dependent.trim();
  if (isNonAnswer(iv) || isNonAnswer(dv)) {
    q.push('What will you change, and what will you look at?');
  } else if (!aboutExperiment(plan, iv) || !aboutExperiment(plan, dv)) {
    q.push('How do these fit your experiment?');
  }
  const controls = v.controlled.map((c) => c.text.trim()).filter(Boolean);
  if (controls.some((c) => isNonAnswer(c) || EMPTY_CONTROL.test(c) || contentWords(c).length === 0)) {
    q.push('Which things will you keep the same? Can you name one?');
  }
  if (v.controlled.slice(CONTROL_BASE).some((c) => !c.text.trim())) q.push(EXTRA_EMPTY);
  const seen = new Set<string>();
  for (const c of controls) {
    const key = normalise(c);
    if (seen.has(key)) q.push(EXTRA_REPEAT);
    seen.add(key);
  }
  const ivWords = contentWords(iv);
  if (ivWords.length && controls.some((c) => contentWords(c.replace(/^\s*(the\s+)?same\s+/i, ''))[0] === ivWords[0])) {
    q.push(EXTRA_SECOND_CHANGE);
  }
  return q;
}

function justificationOk(text: string): boolean {
  if (!text.trim() || isNonAnswer(text)) return false;
  const words = contentWords(text).filter((w) => !FILLER.has(w));
  if (words.length > 0) return true;
  return /\b(time|count|hold|heat|see|read|measure|measures|measuring|light|water|gas)\b/i.test(text);
}

function apparatusQuestions(plan: Plan): string[] {
  const q: string[] = [];
  const measuring = plan.apparatus.selected.filter((id) => getApparatus(id)?.measuring);
  for (const id of measuring) {
    const j = (plan.apparatus.justifications[id] ?? '').trim();
    if (!justificationOk(j)) q.push(`What will you use the ${apparatusName(id).toLowerCase()} for?`);
  }
  return q;
}

function procedureQuestions(plan: Plan): string[] {
  const steps = plan.procedure.map((s) => s.text.trim()).filter(Boolean);
  if (steps.length === 0 || steps.every(isNonAnswer)) return ['What will you do first in your test?'];
  const all = steps.join(' ');
  if (!onTopic(plan, all) && !LOOK_AT.test(all)) return ['How do these steps fit your experiment?'];
  return [];
}

/** The first two controlled cards are required. Students may add up to four more. */
export const CONTROL_BASE = 2;
export const CONTROL_EXTRA_MAX = 4;
export const CONTROL_MAX = CONTROL_BASE + CONTROL_EXTRA_MAX;

export const EXTRA_EMPTY = 'Write something you keep the same, or remove this card.';
export const EXTRA_SECOND_CHANGE = 'A fair test changes only one thing. Keep this the same, or remove this card.';
export const EXTRA_REPEAT = 'You already wrote this. Remove it, or name a different thing you keep the same.';

/** Fixed card failures. The model must not replace these instructions. */
export const FIXED_CARD_FAILS = new Set([EXTRA_EMPTY, EXTRA_SECOND_CHANGE, EXTRA_REPEAT]);

/** The cards Next checks one by one. Empty base cards are not cards yet. Empty extra cards are. */
export function answerBoxes(plan: Plan, stage: ReviewedStage): AnswerBox[] {
  if (stage === 'hypothesis') {
    return [{ id: 'hypothesis', label: 'hypothesis', text: plan.hypothesis, kind: 'hypothesis' }];
  }
  if (stage === 'variables') {
    const v = plan.variables;
    return [
      { id: 'independent', label: 'independent variable', text: v.independent, kind: 'independent' },
      { id: 'dependent', label: 'dependent variable', text: v.dependent, kind: 'dependent' },
      ...v.controlled.flatMap((c, index) => {
        const extra = index >= CONTROL_BASE;
        if (!c.text.trim() && !extra) return [];
        return [{ id: c.id, label: extra ? 'extra controlled variable' : 'controlled variable', text: c.text, kind: 'controlled' as const }];
      }),
    ];
  }
  if (stage === 'apparatus') {
    return plan.apparatus.selected
      .filter((id) => (plan.apparatus.justifications[id] ?? '').trim())
      .map((id) => ({
        id,
        label: `reason for the ${apparatusName(id).toLowerCase()}`,
        text: plan.apparatus.justifications[id] ?? '',
        kind: 'justification' as const,
      }));
  }
  if (stage === 'procedure') {
    return plan.procedure
      .filter((s) => s.text.trim())
      .map((s) => ({ id: s.id, label: 'procedure step', text: s.text, kind: 'step' as const }));
  }
  return [];
}

const STEP_ACTION =
  /\b(add|boil|collect|compare|count|cover|heat|leave|measure|note|place|pour|put|read|record|repeat|rinse|set|start|stop|test|time|warm|wash|wrap|write)\b/i;

/**
 * The easy S1–S2 bar for one card. A simple on-topic answer passes.
 * The question guides the student and does not contain the answer.
 */
export function heuristicBoxReview(plan: Plan, box: AnswerBox): QualityResult {
  const text = box.text.trim();
  const fail = (question: string): QualityResult => ({ passed: false, feedbackQuestions: [question] });
  if (box.kind === 'hypothesis') {
    const questions = hypothesisQuestions({ ...plan, hypothesis: text });
    return { passed: questions.length === 0, feedbackQuestions: questions.slice(0, 1) };
  }
  if (box.kind === 'independent') {
    if (isNonAnswer(text)) return fail('What is the one thing you will change?');
    if (!aboutExperiment(plan, text)) return fail('How does this fit your experiment?');
    return { passed: true, feedbackQuestions: [] };
  }
  if (box.kind === 'dependent') {
    if (isNonAnswer(text)) return fail('What will you look at?');
    if (!aboutExperiment(plan, text)) return fail('What will you look at in your test?');
    return { passed: true, feedbackQuestions: [] };
  }
  if (box.kind === 'controlled') {
    const index = plan.variables.controlled.findIndex((c) => c.id === box.id);
    if (!text) return fail(EXTRA_EMPTY);
    if (isNonAnswer(text) || EMPTY_CONTROL.test(normalise(text)) || contentWords(text).length === 0) {
      return fail(index >= CONTROL_BASE ? EXTRA_EMPTY : 'What will you keep the same? Can you name one thing?');
    }
    const key = normalise(text);
    const earlier = [
      plan.variables.independent,
      plan.variables.dependent,
      ...plan.variables.controlled.slice(0, Math.max(index, 0)).map((c) => c.text),
    ];
    if (key.length >= 3 && earlier.some((other) => normalise(other) === key)) {
      return fail(key === normalise(plan.variables.independent) ? EXTRA_SECOND_CHANGE : EXTRA_REPEAT);
    }
    const ivWords = contentWords(plan.variables.independent);
    const own = contentWords(text.replace(/^\s*(the\s+)?same\s+/i, ''));
    if (ivWords.length && own[0] === ivWords[0]) return fail(EXTRA_SECOND_CHANGE);
    return { passed: true, feedbackQuestions: [] };
  }
  if (box.kind === 'justification') {
    if (!justificationOk(text)) return fail('What will you use this for?');
    return { passed: true, feedbackQuestions: [] };
  }
  if (isNonAnswer(text) || text.split(/\s+/).length < 2) return fail('What do you do in this step?');
  if (!aboutExperiment(plan, text) && !STEP_ACTION.test(text)) return fail('How does this step fit your experiment?');
  return { passed: true, feedbackQuestions: [] };
}

/**
 * Junior-form (S1–S2) quality checks. A short, on-topic idea is enough.
 * Used on its own in Demo mode, and as a pass that the AI reviewer is not allowed to overturn.
 * The questions guide the student; they never contain the answer.
 * Safety blocks are separate and are never relaxed here.
 */
export function heuristicStageReview(plan: Plan, stage: ReviewedStage): QualityResult {
  const byStage: Record<ReviewedStage, () => string[]> = {
    hypothesis: () => hypothesisQuestions(plan),
    variables: () => variablesQuestions(plan),
    apparatus: () => apparatusQuestions(plan),
    procedure: () => procedureQuestions(plan),
    summary: () => [
      ...hypothesisQuestions(plan),
      ...variablesQuestions(plan),
      ...apparatusQuestions(plan),
      ...procedureQuestions(plan),
    ],
  };
  const questions = [...new Set(byStage[stage]())].slice(0, 3);
  return { passed: questions.length === 0, feedbackQuestions: questions };
}
