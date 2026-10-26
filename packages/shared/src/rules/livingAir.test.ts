import { describe, expect, it } from 'vitest';
import { APPARATUS, THEMES, apparatusForTheme, isThemeId } from '../apparatus.js';
import type { Plan, Scene, ThemeId } from '../types.js';
import { emptyPlan, validatePlan } from './plan.js';
import { detectPlanHazards, safetyChecklist } from './hazards.js';
import { checkDiagram, hasSafetyBlock } from './diagram.js';
import { heuristicStageReview } from './quality.js';

const HAN = /\p{Script=Han}/u;

const TRAYS: Record<string, string[]> = {
  'iodine-starch': ['spotting-tile', 'iodine-solution', 'dropper'],
  'leaf-starch': ['leaf', 'beaker', 'boiling-tube', 'alcohol-tube', 'white-tile', 'iodine-solution', 'dropper', 'tongs'],
  'oxygen-plant': ['water-plant', 'filter-funnel', 'beaker', 'test-tube', 'sodium-hydrogencarbonate', 'glowing-splint', 'lamp'],
  'light-needed': ['leaf', 'foil-strip', 'beaker', 'boiling-tube', 'alcohol-tube', 'white-tile', 'iodine-solution', 'dropper', 'tongs', 'lamp'],
  'chlorophyll-needed': ['variegated-leaf', 'beaker', 'boiling-tube', 'alcohol-tube', 'white-tile', 'iodine-solution', 'dropper', 'tongs', 'lamp'],
  'carbon-dioxide-needed': ['leaf', 'soda-lime', 'beaker', 'boiling-tube', 'alcohol-tube', 'white-tile', 'iodine-solution', 'dropper', 'tongs', 'lamp'],
};

function ids(theme: ThemeId): string[] {
  return apparatusForTheme(theme).themeItems.map((a) => a.id).sort();
}

function scene(items: Scene['items']): Scene {
  return { items, containment: [], connections: [], labels: [] };
}

describe('Living things and air', () => {
  it('adds six practicals and leaves the rate theme unchanged', () => {
    const rate = THEMES.find((t) => t.id === 'photosynthesis')!;
    expect(rate.title).toBe('Factors affecting rate of photosynthesis');
    expect(rate.blurb).toBe('How does light, carbon dioxide or temperature change how fast a plant makes oxygen?');
    expect(rate.group).toBeUndefined();
    expect(APPARATUS.find((a) => a.id === 'pondweed')?.themes).toEqual(['photosynthesis']);

    const living = THEMES.filter((t) => t.group === 'Living things and air');
    expect(living.map((t) => t.id)).toEqual([
      'iodine-starch',
      'leaf-starch',
      'oxygen-plant',
      'light-needed',
      'chlorophyll-needed',
      'carbon-dioxide-needed',
    ]);
    expect(living.map((t) => t.title)).toEqual([
      'Iodine test for starch',
      'Starch in a green leaf',
      'Oxygen from a water plant',
      'Is light needed?',
      'Is chlorophyll needed?',
      'Is carbon dioxide needed?',
    ]);
    expect(THEMES.map((t) => `${t.title} ${t.blurb} ${t.note ?? ''}`).join('\n')).not.toMatch(HAN);
    expect(isThemeId('light-needed')).toBe(true);
    expect(isThemeId('water-needed')).toBe(false);
    const note = (id: string) => THEMES.find((t) => t.id === id)?.note ?? '';
    expect(note('iodine-starch')).toBe('School lab, with your teacher. Practise this before the leaf test.');
    expect(note('leaf-starch')).toBe('School lab, with your teacher. Heat alcohol only in a hot water bath, with the Bunsen off.');
    expect(note('oxygen-plant')).toBe('School lab, with your teacher. The glowing splint is a teacher demonstration.');
    expect(note('light-needed')).toBe('School lab, with your teacher. Your teacher destarches the plant before the lesson. Heat alcohol only in a hot water bath, with the Bunsen off.');
    expect(note('chlorophyll-needed')).toBe(note('light-needed'));
    expect(note('carbon-dioxide-needed')).toBe('School lab, with your teacher. Your teacher destarches the plant and handles the soda lime.');
    expect(note('insulation')).toBe('Hot water provided by the teacher.');
  });

  it('gives each practical only its own apparatus, plus the common tray', () => {
    for (const [theme, want] of Object.entries(TRAYS)) {
      expect(ids(theme as ThemeId)).toEqual([...want].sort());
      const common = apparatusForTheme(theme as ThemeId).common.map((a) => a.id);
      expect(common).toEqual(expect.arrayContaining(['bunsen-burner', 'safety-goggles', 'tripod', 'gauze', 'clamp-stand']));
      expect(common).not.toContain('leaf');
    }
    expect(ids('photosynthesis')).toContain('pondweed');
    expect(ids('photosynthesis')).not.toContain('leaf');
    expect(new Set(APPARATUS.map((a) => a.id)).size).toBe(APPARATUS.length);
  });

  it('draws the new items in the side-view library', () => {
    for (const id of ['leaf', 'variegated-leaf', 'foil-strip', 'white-tile', 'alcohol-tube', 'soda-lime', 'filter-funnel', 'water-plant', 'glowing-splint']) {
      const item = APPARATUS.find((a) => a.id === id);
      expect(item?.svg.length).toBeGreaterThan(20);
      expect(item?.name).not.toMatch(HAN);
    }
    expect(APPARATUS.find((a) => a.id === 'alcohol-tube')).toMatchObject({ flammable: true, name: 'Alcohol in a boiling tube' });
    expect(APPARATUS.find((a) => a.id === 'soda-lime')).toMatchObject({ corrosive: true });
    expect(APPARATUS.find((a) => a.id === 'glowing-splint')?.name).toMatch(/teacher demonstration/i);
    expect(APPARATUS.find((a) => a.id === 'spotting-tile')?.themes).toContain('iodine-starch');
    expect(APPARATUS.find((a) => a.id === 'iodine-solution')?.themes).toContain('light-needed');
  });
});

describe('starch and oxygen pass bar', () => {
  function plan(theme: ThemeId, hypothesis: string): Plan {
    const p = emptyPlan();
    p.theme.theme = theme;
    p.hypothesis = hypothesis;
    return p;
  }

  it('passes a sentence that names the factor and starch, or oxygen for the gas test', () => {
    const pass: [ThemeId, string][] = [
      ['iodine-starch', 'Iodine turns blue-black with starch.'],
      ['leaf-starch', 'A green leaf has starch.'],
      ['oxygen-plant', 'The water plant makes oxygen.'],
      ['light-needed', 'Light is needed to make starch.'],
      ['chlorophyll-needed', 'Chlorophyll is needed to make starch.'],
      ['carbon-dioxide-needed', 'Carbon dioxide is needed to make starch.'],
    ];
    for (const [theme, hypothesis] of pass) {
      expect(heuristicStageReview(plan(theme, hypothesis), 'hypothesis')).toEqual({ passed: true, feedbackQuestions: [] });
    }
  });

  it('still rejects a sentence that misses the factor or the result', () => {
    expect(heuristicStageReview(plan('light-needed', 'I like starch.'), 'hypothesis').passed).toBe(false);
    expect(heuristicStageReview(plan('light-needed', 'Light is needed.'), 'hypothesis').passed).toBe(false);
    expect(heuristicStageReview(plan('oxygen-plant', 'The plant makes bubbles.'), 'hypothesis').passed).toBe(false);
    expect(heuristicStageReview(plan('light-needed', 'Bouncing balls go further.'), 'hypothesis').passed).toBe(false);
    expect(heuristicStageReview(plan('photosynthesis', 'Plants like light.'), 'hypothesis').passed).toBe(false);
  });

  it('does not demand a measuring instrument for a colour or gas test', () => {
    const p = emptyPlan();
    p.theme.theme = 'light-needed';
    p.apparatus.selected = ['leaf', 'foil-strip'];
    expect(validatePlan(p).stages.apparatus.issues.some((i) => i.ruleId === 'apparatus_no_measuring')).toBe(false);
    expect(validatePlan(p).stages.apparatus.complete).toBe(true);

    p.theme.theme = 'photosynthesis';
    p.apparatus.selected = ['pondweed', 'beaker'];
    expect(validatePlan(p).stages.apparatus.issues.some((i) => i.ruleId === 'apparatus_no_measuring')).toBe(true);
  });
});

describe('living-things safety rules', () => {
  it('still blocks heating alcohol with a flame, and allows a hot water bath', () => {
    const p = emptyPlan();
    p.theme.theme = 'light-needed';
    p.hypothesis = 'Light is needed to make starch.';
    p.procedure = [{ id: 's1', text: 'Heat the alcohol over a Bunsen burner.' }];
    const block = detectPlanHazards(p).find((b) => b.ruleId === 'ethanol_flame');
    expect(block?.severity).toBe('safety_block');
    expect(block?.alternative).toMatch(/hot water|water bath/i);
    expect(block?.alternative).toMatch(/off/i);

    p.apparatus.selected = ['alcohol-tube', 'bunsen-burner', 'safety-goggles', 'tongs'];
    p.procedure = [{ id: 's1', text: 'Turn the Bunsen burner off and move it away. Warm the alcohol in a hot water bath.' }];
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'ethanol_flame')).toBe(false);
  });

  it('blocks soda lime without goggles, and blocks students touching it', () => {
    const p = emptyPlan();
    p.theme.theme = 'carbon-dioxide-needed';
    p.apparatus.selected = ['soda-lime', 'leaf'];
    const missing = detectPlanHazards(p).find((b) => b.ruleId === 'soda_lime_goggles');
    expect(missing?.message).toMatch(/eye protection/i);
    expect(missing?.alternative).toMatch(/teacher handles/i);

    p.apparatus.selected.push('safety-goggles');
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'soda_lime_goggles')).toBe(false);

    p.procedure = [{ id: 's1', text: 'I will put soda lime around the leaf.' }];
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'soda_lime_teacher')).toBe(true);
    p.procedure = [{ id: 's1', text: 'The teacher puts soda lime around the leaf. I do not touch it.' }];
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'soda_lime_teacher')).toBe(false);
    expect(safetyChecklist(p).some((i) => i.id === 'soda-lime-teacher')).toBe(true);
  });

  it('blocks a student glowing-splint step and a splint label with no teacher', () => {
    const p = emptyPlan();
    p.theme.theme = 'oxygen-plant';
    p.hypothesis = 'The water plant makes oxygen.';
    p.procedure = [{ id: 's1', text: 'Test the gas with a glowing splint.' }];
    const block = detectPlanHazards(p).find((b) => b.ruleId === 'splint_teacher');
    expect(block?.alternative).toMatch(/teacher/i);
    p.procedure = [{ id: 's1', text: 'The teacher tests the gas with a glowing splint.' }];
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'splint_teacher')).toBe(false);
    expect(safetyChecklist(p).some((i) => i.id === 'splint-teacher')).toBe(true);

    const bare = scene([{ id: 'sp', apparatusId: 'glowing-splint', x: 100, y: 500, rotation: 0, label: 'Splint' }]);
    expect(checkDiagram(bare, p).find((c) => c.ruleId === 'diagram_splint_teacher')?.passed).toBe(false);
    const labelled = scene([
      { id: 'sp', apparatusId: 'glowing-splint', x: 100, y: 500, rotation: 0, label: 'Glowing splint (teacher demonstration)' },
    ]);
    expect(hasSafetyBlock(checkDiagram(labelled, p))).toBe(false);
  });

  it('blocks soda lime on the canvas without goggles, and alcohol over a flame', () => {
    const p = emptyPlan();
    p.theme.theme = 'carbon-dioxide-needed';
    const bare = scene([{ id: 's', apparatusId: 'soda-lime', x: 200, y: 500, rotation: 0, label: 'Soda lime' }]);
    const soda = checkDiagram(bare, p).find((c) => c.ruleId === 'diagram_soda_lime');
    expect(soda?.passed).toBe(false);
    expect(soda?.alternative).toMatch(/teacher handles/i);

    const safe = scene([
      { id: 's', apparatusId: 'soda-lime', x: 200, y: 500, rotation: 0, label: 'Soda lime' },
      { id: 'g', apparatusId: 'safety-goggles', x: 40, y: 520, rotation: 0, label: 'Goggles' },
    ]);
    expect(hasSafetyBlock(checkDiagram(safe, p))).toBe(false);

    const flame = scene([
      { id: 'b', apparatusId: 'bunsen-burner', x: 400, y: 430, rotation: 0, label: 'Bunsen burner' },
      { id: 'a', apparatusId: 'alcohol-tube', x: 410, y: 250, rotation: 0, label: 'Alcohol' },
      { id: 'g', apparatusId: 'safety-goggles', x: 40, y: 520, rotation: 0, label: 'Goggles' },
    ]);
    expect(checkDiagram(flame, p).find((c) => c.ruleId === 'diagram_ethanol_flame')?.passed).toBe(false);
  });
});
