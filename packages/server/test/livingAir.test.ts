import { describe, expect, it } from 'vitest';
import { emptyPlan, validatePlan, type Plan, type ThemeId } from '@labguide/shared';
import { exampleAnswer } from '../src/examples.js';
import { hintChoices, lessonThemes, retrieveLesson } from '../src/lessons.js';
import { DemoAdapter } from '../src/providers/demo.js';
import { TUTOR_SYSTEM_PROMPT } from '../src/providers/deepseek.js';

const HAN = /\p{Script=Han}/u;
const THEMES: ThemeId[] = [
  'iodine-starch',
  'leaf-starch',
  'oxygen-plant',
  'light-needed',
  'chlorophyll-needed',
  'carbon-dioxide-needed',
];

describe('examples for each practical', () => {
  it('gives a short English example for that practical only', () => {
    const seen = new Set<string>();
    for (const theme of THEMES) {
      const plan = emptyPlan();
      plan.theme.theme = theme;
      for (const stage of ['hypothesis', 'variables', 'apparatus', 'procedure', 'summary'] as const) {
        const text = exampleAnswer(plan, stage);
        expect(text.length).toBeGreaterThan(10);
        expect(text.length).toBeLessThan(220);
        expect(text).not.toMatch(HAN);
        expect(text).not.toMatch(/光合作用|澱粉/);
      }
      const hypothesis = exampleAnswer(plan, 'hypothesis');
      expect(seen.has(hypothesis)).toBe(false);
      seen.add(hypothesis);
    }
    const light = emptyPlan();
    light.theme.theme = 'light-needed';
    expect(exampleAnswer(light, 'hypothesis')).toBe('Light is needed to make starch.');
    const gas = emptyPlan();
    gas.theme.theme = 'oxygen-plant';
    expect(exampleAnswer(gas, 'hypothesis')).toMatch(/oxygen/i);
    expect(exampleAnswer(gas, 'procedure')).toMatch(/teacher/i);
    const co2 = emptyPlan();
    co2.theme.theme = 'carbon-dioxide-needed';
    expect(exampleAnswer(co2, 'hypothesis')).toMatch(/carbon dioxide/i);
    expect(exampleAnswer(co2, 'hypothesis')).toMatch(/starch/i);
  });
});

const OLDER = ['photosynthesis', 'enzyme', 'dissolving', 'insulation'] as const;

describe('lesson briefs', () => {
  it('has a short brief and three hint choices for every practical and stage', async () => {
    const stages = ['theme', 'hypothesis', 'variables', 'apparatus', 'procedure', 'safety', 'summary', 'diagram'] as const;
    expect(lessonThemes().slice().sort()).toEqual([...THEMES, ...OLDER].slice().sort());
    for (const theme of lessonThemes()) {
      const brief = retrieveLesson(theme);
      expect(brief?.aim.length).toBeGreaterThan(10);
      expect(brief?.fairTest.length).toBeGreaterThan(10);
      expect(brief?.names.length).toBeGreaterThan(10);
      expect(brief?.control.length).toBeGreaterThan(10);
      expect(brief?.safety).toMatch(/teacher|school lab/i);
      expect(JSON.stringify(brief)).not.toMatch(HAN);
      const plan = emptyPlan();
      plan.theme.theme = theme;
      for (const stage of stages) {
        const choices = hintChoices(theme, stage);
        expect(choices).toHaveLength(3);
        expect(choices?.filter((c) => !c.why)).toHaveLength(1);
        expect(choices?.filter((c) => c.why)).toHaveLength(2);
        for (const choice of choices ?? []) {
          expect(choice.text.length).toBeGreaterThan(8);
          expect(choice.text.length).toBeLessThan(180);
          if (choice.why) expect(choice.why.endsWith('.')).toBe(true);
        }
      }
      const draft = await new DemoAdapter().sendTurn({
        request: { type: 'hint', stage: 'hypothesis' },
        stage: 'hypothesis',
        plan,
        validation: validatePlan(plan),
        diagramChecks: [],
        hintLevel: 3,
        history: [],
      });
      expect(draft.choices?.some((c) => !c.why)).toBe(true);
      expect(draft.text).not.toMatch(/toy car|different topic|pendulum/);
    }
    expect(retrieveLesson('custom')).toBeNull();
    expect(retrieveLesson(null)).toBeNull();
  });
});

describe('tutor facts', () => {
  it('may say water cannot be tested because the plant would die', async () => {
    expect(TUTOR_SYSTEM_PROMPT).toMatch(/plant would die/);
    expect(TUTOR_SYSTEM_PROMPT).toMatch(/not a step at home/);
    const plan: Plan = emptyPlan();
    plan.theme.theme = 'light-needed';
    const draft = await new DemoAdapter().sendTurn({
      request: { type: 'message', stage: 'hypothesis', text: 'Can we test if water is needed?' },
      stage: 'hypothesis',
      plan,
      validation: validatePlan(plan),
      diagramChecks: [],
      hintLevel: 1,
      history: [],
    });
    expect(draft.text).toMatch(/would die/i);
    expect(draft.text).not.toMatch(HAN);
  });
});
