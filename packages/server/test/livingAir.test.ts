import { describe, expect, it } from 'vitest';
import { emptyPlan, validatePlan, type Plan, type ThemeId } from '@labguide/shared';
import { exampleAnswer } from '../src/examples.js';
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
