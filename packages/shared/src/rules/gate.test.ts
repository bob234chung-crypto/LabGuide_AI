import { describe, expect, it } from 'vitest';
import type { Plan, StageReview } from '../types.js';
import { canOpenDiagram, gatedFurthest, isGatedStageUnlocked, reviewsNeededFor, stageAnswerKey } from './gate.js';
import { emptyPlan, validatePlan } from './plan.js';
import { heuristicStageReview } from './quality.js';
import { safetyChecklist } from './hazards.js';

function goodPlan(): Plan {
  const p = emptyPlan();
  p.theme.theme = 'photosynthesis';
  p.hypothesis = 'If the lamp is closer to the pondweed, then more bubbles will be produced per minute.';
  p.variables = {
    independent: 'Distance of the lamp',
    dependent: 'Number of bubbles per minute',
    controlled: [
      { id: 'a', text: 'Temperature of water' },
      { id: 'b', text: 'Type of pondweed' },
    ],
  };
  p.apparatus = {
    selected: ['pondweed', 'boiling-tube', 'lamp', 'metre-rule', 'stopwatch', 'safety-goggles'],
    justifications: { 'metre-rule': 'To measure the distance precisely in cm.', stopwatch: 'To time exactly one minute for each count.' },
  };
  p.procedure = [
    'Put the pondweed in a boiling tube of water.',
    'Place the lamp 10 cm away using the metre rule.',
    'Count and record the bubbles for one minute.',
    'Repeat three times at each distance.',
  ].map((text, i) => ({ id: `s${i}`, text }));
  for (const item of safetyChecklist(p)) p.safety.checklist[item.id] = true;
  return p;
}

const passed = (plan: Plan, stage: StageReview['stage']): StageReview => ({
  stage,
  passed: true,
  feedbackQuestions: [],
  source: 'ai',
  answerKey: stageAnswerKey(plan, stage),
  reviewedAt: '',
});

describe('stage gate', () => {
  it('holds the student at the first stage without a passed review', () => {
    const p = goodPlan();
    const v = validatePlan(p);
    expect(v.furthestUnlocked).toBe('summary');
    expect(gatedFurthest(v, p, {})).toBe('hypothesis');
    const reviews = { hypothesis: passed(p, 'hypothesis'), variables: passed(p, 'variables') };
    expect(gatedFurthest(v, p, reviews)).toBe('apparatus');
    expect(isGatedStageUnlocked(v, p, reviews, 'procedure')).toBe(false);
  });

  it('opens the diagram only when every review passed, and an edit re-locks later stages', () => {
    const p = goodPlan();
    const v = validatePlan(p);
    const all = Object.fromEntries(
      (['hypothesis', 'variables', 'apparatus', 'procedure', 'summary'] as const).map((s) => [s, passed(p, s)]),
    );
    expect(canOpenDiagram(v, p, all)).toBe(true);
    const edited = { ...p, hypothesis: `${p.hypothesis} Maybe.` };
    expect(gatedFurthest(validatePlan(edited), edited, all)).toBe('hypothesis');
    expect(canOpenDiagram(validatePlan(edited), edited, all)).toBe(false);
  });

  it('never unlocks what the rules lock, even with passed reviews', () => {
    const p = goodPlan();
    const all = Object.fromEntries(
      (['hypothesis', 'variables', 'apparatus', 'procedure', 'summary'] as const).map((s) => [s, passed(p, s)]),
    );
    const broken = { ...p, procedure: [...p.procedure, { id: 'x', text: 'Heat the ethanol over a Bunsen burner flame.' }] };
    expect(canOpenDiagram(validatePlan(broken), broken, all)).toBe(false);
  });

  it('fingerprints answers the same way regardless of key order or spacing', () => {
    const p = goodPlan();
    const q: Plan = JSON.parse(JSON.stringify(p));
    q.variables = { controlled: q.variables.controlled.map((c) => ({ text: `  ${c.text} `, id: c.id })), dependent: q.variables.dependent, independent: q.variables.independent } as Plan['variables'];
    expect(stageAnswerKey(q, 'variables')).toBe(stageAnswerKey(p, 'variables'));
    expect(stageAnswerKey(p, 'variables')).not.toBe(stageAnswerKey(p, 'hypothesis'));
  });

  it('lists the reviews needed for a target', () => {
    expect(reviewsNeededFor('variables')).toEqual(['hypothesis']);
    expect(reviewsNeededFor('safety')).toEqual(['hypothesis', 'variables', 'apparatus', 'procedure']);
    expect(reviewsNeededFor('diagram')).toContain('summary');
  });
});

describe('stricter built-in quality checks', () => {
  it('pass a good plan', () => {
    const p = goodPlan();
    for (const s of ['hypothesis', 'variables', 'apparatus', 'procedure', 'summary'] as const) {
      expect(heuristicStageReview(p, s)).toEqual({ passed: true, feedbackQuestions: [] });
    }
  });

  it('accepts a plain testable sentence and does not demand a set form', () => {
    const p = goodPlan();
    p.hypothesis = 'The pondweed makes more bubbles when the lamp is closer.';
    expect(heuristicStageReview(p, 'hypothesis')).toEqual({ passed: true, feedbackQuestions: [] });

    p.hypothesis = 'Plants like light.';
    const weak = heuristicStageReview(p, 'hypothesis');
    expect(weak.passed).toBe(false);
    expect(weak.feedbackQuestions.join(' ')).not.toMatch(/If … then|As \[X\]/);
    expect(weak.feedbackQuestions.every((q) => q.endsWith('?'))).toBe(true);
  });

  it('block weak answers the basic rules allow, with at most 3 questions', () => {
    const p = goodPlan();
    p.hypothesis = 'If the light changes then the plant will do better.';
    const h = heuristicStageReview(p, 'hypothesis');
    expect(h.passed).toBe(false);
    expect(h.feedbackQuestions.length).toBeLessThanOrEqual(3);
    expect(h.feedbackQuestions.every((q) => q.endsWith('?'))).toBe(true);

    const v = goodPlan();
    v.variables.dependent = 'How healthy the plant looks';
    expect(heuristicStageReview(v, 'variables').passed).toBe(false);

    const same = goodPlan();
    same.variables.controlled.push({ id: 'c', text: 'Same piece of pondweed' });
    expect(heuristicStageReview(same, 'variables').passed).toBe(true);
    same.variables.controlled.push({ id: 'd', text: 'The distance from the lamp' });
    expect(heuristicStageReview(same, 'variables').feedbackQuestions).toContain('Can you keep something the same if you also change it on purpose?');

    const a = goodPlan();
    a.apparatus.justifications.stopwatch = 'It is useful.';
    expect(heuristicStageReview(a, 'apparatus').passed).toBe(false);

    const pr = goodPlan();
    pr.procedure = pr.procedure.filter((s) => !/Repeat/.test(s.text));
    expect(heuristicStageReview(pr, 'procedure').feedbackQuestions).toContain('How many times will you repeat each test? Why does that help?');
  });
});
