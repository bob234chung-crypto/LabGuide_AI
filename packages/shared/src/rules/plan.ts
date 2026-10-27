import { apparatusName, getApparatus } from '../apparatus.js';
import {
  PLAN_STAGES,
  type AppStage,
  type Issue,
  type Plan,
  type PlanStage,
  type PlanValidation,
  type StageValidation,
} from '../types.js';
import { detectPlanHazards, safetyChecklist } from './hazards.js';
import { normalise, wordCount } from './text.js';

export function emptyPlan(): Plan {
  return {
    theme: { theme: null, customTitle: '' },
    hypothesis: '',
    variables: {
      independent: '',
      dependent: '',
      controlled: [
        { id: 'c1', text: '' },
        { id: 'c2', text: '' },
      ],
    },
    apparatus: { selected: [], justifications: {} },
    procedure: [{ id: 's1', text: '' }],
    safety: { checklist: {} },
  };
}

const CHANGE_WORDS =
  /\b(increase|increases|decrease|decreases|more|less|faster|slower|higher|lower|bigger|smaller|longer|shorter|rise|fall|change|changes|greater|fewer)\b/i;

/** A blank or a single word is not a sentence yet. This is not a grammar check. */
const MIN_SENTENCE_CHARS = 8;
const MIN_SENTENCE_WORDS = 2;

/** True when the student has written a sentence, not when it is a strong prediction. */
export function hypothesisWritten(text: string): boolean {
  const t = text.trim();
  return t.length >= MIN_SENTENCE_CHARS && wordCount(t) >= MIN_SENTENCE_WORDS;
}

function hypothesisStage(plan: Plan): StageValidation {
  const text = plan.hypothesis.trim();
  const issues: Issue[] = [];
  const praise: string[] = [];
  if (!hypothesisWritten(text)) {
    issues.push({
      ruleId: 'hypothesis_empty',
      stage: 'hypothesis',
      severity: 'info',
      required: true,
      message: 'Write your hypothesis as a sentence.',
    });
  } else {
    praise.push('Good. You wrote your idea as a sentence.');
    // Direction words (faster, slower, more) are not required at S1–S2. Praise them when present.
    if (CHANGE_WORDS.test(text)) {
      praise.push('Good. You said which way you think the result will go.');
    }
    if (/\b(better|best|good|nice|work)\b/i.test(text)) {
      issues.push({
        ruleId: 'hypothesis_vague',
        stage: 'hypothesis',
        severity: 'hint',
        message: 'Words like "better" are hard to measure. What exactly will you measure instead?',
      });
    }
  }
  return { stage: 'hypothesis', complete: false, issues, praise };
}

const MEASURABLE =
  /\b(time|seconds|minutes|volume|cm3|cm³|temperature|°c|mass|grams|number|count|rate|height|length|distance|bubbles|colour|color|ph|amount|how long|how fast|speed)\b/i;

function variablesStage(plan: Plan): StageValidation {
  const v = plan.variables;
  const issues: Issue[] = [];
  const praise: string[] = [];
  const iv = normalise(v.independent);
  const dv = normalise(v.dependent);
  if (iv.length < 3) {
    issues.push({
      ruleId: 'iv_missing',
      stage: 'variables',
      severity: 'info',
      required: true,
      field: 'independent',
      message: 'What is the one thing you will change on purpose?',
    });
  }
  if (dv.length < 3) {
    issues.push({
      ruleId: 'dv_missing',
      stage: 'variables',
      severity: 'info',
      required: true,
      field: 'dependent',
      message: 'What will you measure to see the effect?',
    });
  } else if (!MEASURABLE.test(dv)) {
    issues.push({
      ruleId: 'dv_measurable',
      stage: 'variables',
      severity: 'hint',
      field: 'dependent',
      message: 'How will you measure your dependent variable? What unit will you use?',
    });
  } else {
    praise.push('Good. Your dependent variable is something you can measure.');
  }
  if (iv && dv && iv === dv) {
    issues.push({
      ruleId: 'iv_equals_dv',
      stage: 'variables',
      severity: 'hint',
      required: true,
      message: 'Your independent and dependent variables are the same. Which one do you change, and which one do you measure?',
    });
  }
  const filled = v.controlled.map((c) => normalise(c.text)).filter((t) => t.length >= 3);
  if (filled.length < 2) {
    issues.push({
      ruleId: 'controlled_count',
      stage: 'variables',
      severity: 'info',
      required: true,
      field: 'controlled',
      message: 'Add at least 2 controlled variables. What must stay the same to keep the test fair?',
    });
  } else {
    praise.push(`Good. You listed ${filled.length} things to keep the same. That keeps your test fair.`);
  }
  const hyp = normalise(plan.hypothesis);
  const ivWords = iv.split(' ').filter((w) => w.length > 3);
  if (iv && hyp && ivWords.length && !ivWords.some((w) => hyp.includes(w))) {
    issues.push({
      ruleId: 'iv_not_in_hypothesis',
      stage: 'variables',
      severity: 'hint',
      field: 'independent',
      message: 'Does your hypothesis talk about the same variable you change here?',
    });
  }
  return { stage: 'variables', complete: false, issues, praise };
}

function apparatusStage(plan: Plan): StageValidation {
  const a = plan.apparatus;
  const issues: Issue[] = [];
  const praise: string[] = [];
  if (a.selected.length < 2) {
    issues.push({
      ruleId: 'apparatus_count',
      stage: 'apparatus',
      severity: 'info',
      required: true,
      message: 'Choose the apparatus you will need. What will hold your materials, and what will measure your results?',
    });
  }
  const measuring = a.selected.filter((id) => getApparatus(id)?.measuring);
  // These practicals look at a colour change or a gas test, not a scale reading.
  const qualitative = new Set([
    'iodine-starch',
    'leaf-starch',
    'oxygen-plant',
    'light-needed',
    'chlorophyll-needed',
    'carbon-dioxide-needed',
  ]);
  if (a.selected.length >= 2 && measuring.length === 0 && !qualitative.has(plan.theme.theme ?? '')) {
    issues.push({
      ruleId: 'apparatus_no_measuring',
      stage: 'apparatus',
      severity: 'hint',
      required: true,
      message: 'Which piece of apparatus will measure your dependent variable?',
    });
  }
  for (const id of measuring) {
    const j = (a.justifications[id] ?? '').trim();
    const name = apparatusName(id);
    if (!j) {
      issues.push({
        ruleId: 'justification_missing',
        stage: 'apparatus',
        severity: 'hint',
        required: true,
        field: id,
        message: `Why did you choose the ${name.toLowerCase()}? A few words are enough.`,
      });
    } else if (/\b(precise|precisely|accurate|accurately|exact|smaller scale|scale|reading)\b/i.test(j)) {
      praise.push(`Good. You chose the ${name.toLowerCase()} because it measures more precisely.`);
    } else if (/\b(because|so|to|measure|measures)\b/i.test(j)) {
      praise.push(`Good. You gave a reason for using the ${name.toLowerCase()}.`);
    } else {
      issues.push({
        ruleId: 'justification_weak',
        stage: 'apparatus',
        severity: 'hint',
        field: id,
        message: `What will you use the ${name.toLowerCase()} for?`,
      });
    }
  }
  return { stage: 'apparatus', complete: false, issues, praise };
}

function procedureStage(plan: Plan): StageValidation {
  const issues: Issue[] = [];
  const praise: string[] = [];
  const steps = plan.procedure.filter((s) => s.text.trim());
  if (steps.length < 3) {
    issues.push({
      ruleId: 'procedure_count',
      stage: 'procedure',
      severity: 'info',
      required: true,
      message: 'Write at least 3 steps. What do you do first, next and last?',
    });
  }
  const tooShort = steps.find((s) => wordCount(s.text) < 2);
  if (tooShort) {
    issues.push({
      ruleId: 'procedure_step_short',
      stage: 'procedure',
      severity: 'hint',
      required: true,
      field: tooShort.id,
      message: 'One step is only one word. What do you do in that step?',
    });
  }
  const all = steps.map((s) => s.text).join(' ');
  if (steps.length >= 3 && !/\b(repeat|repeats|repeated|again|three times|3 times|average|mean)\b/i.test(all)) {
    issues.push({
      ruleId: 'procedure_repeat',
      stage: 'procedure',
      severity: 'hint',
      message: 'How many times will you repeat each test? How could that make your results more reliable?',
    });
  } else if (steps.length >= 3) {
    praise.push('Good. You repeat your test, which makes your results more reliable.');
  }
  if (steps.length >= 3 && !/\b(measure|record|read|time|count|note|write)\b/i.test(all)) {
    issues.push({
      ruleId: 'procedure_measure',
      stage: 'procedure',
      severity: 'hint',
      message: 'In which step do you measure and record your results?',
    });
  }
  return { stage: 'procedure', complete: false, issues, praise };
}

function themeStage(plan: Plan): StageValidation {
  const issues: Issue[] = [];
  const praise: string[] = [];
  if (!plan.theme.theme) {
    issues.push({
      ruleId: 'theme_missing',
      stage: 'theme',
      severity: 'info',
      required: true,
      message: 'Choose a theme for your investigation.',
    });
  } else if (plan.theme.theme === 'custom' && plan.theme.customTitle.trim().length < 4) {
    issues.push({
      ruleId: 'custom_title',
      stage: 'theme',
      severity: 'info',
      required: true,
      field: 'customTitle',
      message: 'Type a short title for your custom topic.',
    });
  } else {
    praise.push('Good choice. This topic works well as a fair test.');
  }
  return { stage: 'theme', complete: false, issues, praise };
}

function safetyStage(plan: Plan): StageValidation {
  const items = safetyChecklist(plan);
  const missing = items.filter((i) => !plan.safety.checklist[i.id]);
  const issues: Issue[] = [];
  if (missing.length) {
    issues.push({
      ruleId: 'checklist_incomplete',
      stage: 'safety',
      severity: 'info',
      required: true,
      message: `Tick every item on the safety checklist (${missing.length} left).`,
    });
  }
  return {
    stage: 'safety',
    complete: false,
    issues,
    praise: missing.length ? [] : ['Good. You have checked every safety point.'],
  };
}

/** Validates the whole plan. Stage progression is decided here, never by a model. */
export function validatePlan(plan: Plan): PlanValidation {
  const stages: Record<PlanStage, StageValidation> = {
    theme: themeStage(plan),
    hypothesis: hypothesisStage(plan),
    variables: variablesStage(plan),
    apparatus: apparatusStage(plan),
    procedure: procedureStage(plan),
    safety: safetyStage(plan),
    summary: { stage: 'summary', complete: false, issues: [], praise: [] },
  };
  const safetyBlocks = detectPlanHazards(plan);
  for (const block of safetyBlocks) stages[block.stage].issues.unshift(block);

  for (const stage of PLAN_STAGES) {
    if (stage === 'summary') continue;
    stages[stage].complete = !stages[stage].issues.some((i) => i.required);
  }
  const beforeSummary = PLAN_STAGES.filter((s) => s !== 'summary');
  const allComplete = beforeSummary.every((s) => stages[s].complete);
  stages.summary.complete = allComplete && safetyBlocks.length === 0;
  if (!stages.summary.complete) {
    stages.summary.issues.push({
      ruleId: 'summary_incomplete',
      stage: 'summary',
      severity: 'info',
      required: true,
      message: 'Finish every stage, and fix any safety problems, to unlock the diagram.',
    });
  }

  let furthestUnlocked: PlanStage = 'summary';
  for (const s of PLAN_STAGES) {
    if (!stages[s].complete) {
      furthestUnlocked = s;
      break;
    }
  }

  return {
    stages,
    safetyBlocks,
    furthestUnlocked,
    canGenerateDiagram: stages.summary.complete,
  };
}

export function stageIndex(stage: PlanStage): number {
  return PLAN_STAGES.indexOf(stage);
}

export function isStageUnlocked(v: PlanValidation, stage: PlanStage): boolean {
  return stageIndex(stage) <= stageIndex(v.furthestUnlocked);
}

/** Same rule as the server's PUT /progress check, so the client never asks for a locked stage. */
export function isAppStageUnlocked(v: PlanValidation, stage: AppStage): boolean {
  return stage === 'diagram' ? v.canGenerateDiagram : isStageUnlocked(v, stage);
}
