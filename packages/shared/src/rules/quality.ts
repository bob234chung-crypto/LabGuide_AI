import { apparatusName, getApparatus } from '../apparatus.js';
import type { Plan, ReviewedStage, ThemeId } from '../types.js';
import { hypothesisForm } from './plan.js';
import { normalise, wordCount } from './text.js';

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

const VAGUE = /\b(better|best|good|nice|work|works|stuff|thing|things|something|affect it|affects it)\b/i;
const QUANTITY =
  /\b(time|times|seconds?|minutes?|volume|cm3|cm³|ml|temperature|°c|degrees|mass|grams?|kg|number|count|rate|height|length|distance|bubbles?|oxygen|gas|colour|color|ph|amount|concentration|speed|faster|slower|quicker|longer|shorter|higher|lower|more|less|fewer|greater|smaller|bigger|increase|increases|decrease|decreases|dissolves?|cools?|warmer|colder)\b/i;
const MEASURABLE_DV =
  /\b(time|seconds?|minutes?|volume|cm3|cm³|ml|temperature|°c|degrees|mass|grams?|number|count|rate|height|length|distance|bubbles?|colour|color|ph|how long|how fast|speed)\b/i;
const REASON = /\b(because|so|so that|to|as|since|which|for|in order)\b/i;
const MEASURE_WORD = /\b(measure|measures|measuring|record|recorded|read|reading|readings|time|count|counts|note|write down|weigh)\b/i;
const REPEAT = /\b(repeat|repeats|repeated|again|three times|3 times|twice|average|mean)\b/i;
const CHANGE_STEP = /\b(change|changes|vary|different|increase|decrease|each|then use|next use|move|set)\b/i;
const EMPTY_CONTROL = /^(everything|all|same|the same|nothing|none|everything else|all the same|other things|n\/?a)$/i;

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

function hypothesisQuestions(plan: Plan): string[] {
  const text = plan.hypothesis.trim();
  const q: string[] = [];
  const form = hypothesisForm(text);
  if (wordCount(text) < 10) q.push('Can you add more detail? What exactly will you change, and what exactly will you measure?');
  if (VAGUE.test(text)) q.push('Which word in your hypothesis is hard to measure? What could you measure instead?');
  if (form === 'if_then') {
    const m = /^\s*if\b(.*?)\bthen\b(.*)$/is.exec(text);
    if (m && (wordCount(m[1]) < 3 || wordCount(m[2]) < 3)) q.push('Does each part of your "If … then …" sentence say clearly what happens?');
  }
  const effect = form === 'if_then' ? text.split(/\bthen\b/i).slice(1).join(' ') : text;
  if (!QUANTITY.test(effect)) q.push('In your prediction, what result will you measure, and will it go up or down?');
  const topic = topicWords(plan);
  if (topic.length && !mentionsAny(text, topic)) q.push('How does your hypothesis connect to the topic you chose?');
  return q;
}

function variablesQuestions(plan: Plan): string[] {
  const v = plan.variables;
  const q: string[] = [];
  const hyp = normalise(plan.hypothesis);
  const ivWords = contentWords(v.independent);
  const dvWords = contentWords(v.dependent);
  if (!MEASURABLE_DV.test(v.dependent)) q.push('How will you measure your dependent variable? What unit will you use?');
  if (ivWords.length && !ivWords.some((w) => hyp.includes(w))) q.push('Does your hypothesis talk about the same variable you change here?');
  if (dvWords.length && !dvWords.some((w) => hyp.includes(w))) q.push('Does your hypothesis talk about the same thing you measure here?');
  const controls = v.controlled.map((c) => c.text.trim()).filter(Boolean);
  if (controls.some((c) => EMPTY_CONTROL.test(c) || contentWords(c).length === 0)) {
    q.push('Which exact things will you keep the same? Can you name each one?');
  }
  if (ivWords.length && controls.some((c) => contentWords(c).some((w) => ivWords.includes(w) && !dvWords.includes(w)))) {
    q.push('Can you keep something the same if you also change it on purpose?');
  }
  return q;
}

function apparatusQuestions(plan: Plan): string[] {
  const q: string[] = [];
  const measuring = plan.apparatus.selected.filter((id) => getApparatus(id)?.measuring);
  for (const id of measuring) {
    const j = (plan.apparatus.justifications[id] ?? '').trim();
    if (wordCount(j) < 5 || !REASON.test(j)) {
      q.push(`Why is the ${apparatusName(id).toLowerCase()} a good choice? What does it measure, and how precisely?`);
    }
  }
  return q;
}

function procedureQuestions(plan: Plan): string[] {
  const q: string[] = [];
  const steps = plan.procedure.map((s) => s.text.trim()).filter(Boolean);
  const all = steps.join(' ');
  if (steps.some((s) => wordCount(s) < 4)) q.push('Could a classmate follow every step? Which step needs more detail?');
  if (!REPEAT.test(all)) q.push('How many times will you repeat each test? Why does that help?');
  if (!MEASURE_WORD.test(all)) q.push('In which step do you measure and record your results?');
  const ivWords = contentWords(plan.variables.independent);
  if (!(ivWords.some((w) => normalise(all).includes(w)) && CHANGE_STEP.test(all))) {
    q.push('In which step do you change your independent variable? How?');
  }
  return q;
}

/**
 * Stricter deterministic quality checks, used when the AI review is not available.
 * The questions guide the student; they never contain the answer.
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
