import { describe, expect, it } from 'vitest';
import type { Plan, Scene } from '../types.js';
import { emptyPlan, hypothesisWritten, isAppStageUnlocked, validatePlan } from './plan.js';
import { detectPlanHazards, safetyChecklist } from './hazards.js';
import { checkDiagram, hasSafetyBlock } from './diagram.js';
import { hasUnnegated } from './text.js';
import { placeInside, sanitizeScene } from '../scene.js';

function goodPlan(): Plan {
  const p = emptyPlan();
  p.theme = { theme: 'photosynthesis', customTitle: '' };
  p.hypothesis = 'If the lamp is closer to the pondweed, then more oxygen bubbles will be produced per minute.';
  p.variables = {
    independent: 'Distance of the lamp from the pondweed',
    dependent: 'Number of bubbles per minute',
    controlled: [
      { id: 'c1', text: 'Temperature of the water' },
      { id: 'c2', text: 'Amount of sodium hydrogencarbonate' },
    ],
  };
  p.apparatus = {
    selected: ['pondweed', 'boiling-tube', 'lamp', 'metre-rule', 'stopwatch', 'thermometer', 'safety-goggles'],
    justifications: {
      'metre-rule': 'To measure the distance precisely in cm.',
      stopwatch: 'To time one minute exactly for each count.',
      thermometer: 'To check the temperature stays the same because it is a controlled variable.',
    },
  };
  p.procedure = [
    { id: 's1', text: 'Put the pondweed in a boiling tube of water.' },
    { id: 's2', text: 'Place the lamp 10 cm away using the metre rule.' },
    { id: 's3', text: 'Count the bubbles for one minute and record the number.' },
    { id: 's4', text: 'Repeat three times at each distance and find the average.' },
  ];
  for (const item of safetyChecklist(p)) p.safety.checklist[item.id] = true;
  return p;
}

describe('hypothesis sentence', () => {
  it('treats a normal sentence as written, including the example forms', () => {
    expect(hypothesisWritten('The pondweed makes more bubbles when the lamp is closer.')).toBe(true);
    expect(hypothesisWritten('Plants like light.')).toBe(true);
    expect(hypothesisWritten('If the temperature increases, then the enzyme will work faster.')).toBe(true);
    expect(hypothesisWritten('As the water gets hotter, the sugar dissolves faster.')).toBe(true);
  });

  it('treats a blank or one word as not written yet', () => {
    expect(hypothesisWritten('')).toBe(false);
    expect(hypothesisWritten('   ')).toBe(false);
    expect(hypothesisWritten('Bubbles')).toBe(false);
    expect(hypothesisWritten('Go now')).toBe(false);
  });

  it('lets a plain testable sentence complete the stage', () => {
    const p = goodPlan();
    p.hypothesis = 'The pondweed makes more bubbles when the lamp is closer.';
    const stage = validatePlan(p).stages.hypothesis;
    expect(stage.complete).toBe(true);
    expect(stage.issues.some((i) => i.ruleId === 'hypothesis_structure')).toBe(false);
    expect(stage.issues.map((i) => i.message).join(' ')).not.toMatch(/If … then|As \[X\]/);
  });

  it('keeps Next blocked until the sentence is a testable prediction', () => {
    const p = goodPlan();
    p.hypothesis = 'Plants like light.';
    const short = validatePlan(p).stages.hypothesis;
    expect(short.complete).toBe(false);
    expect(short.issues.some((i) => i.ruleId === 'hypothesis_short')).toBe(true);
    expect(short.issues.map((i) => i.message).join(' ')).not.toMatch(/If … then|As \[X\]/);

    p.hypothesis = 'The pondweed sits in water near a bright lamp all day.';
    const flat = validatePlan(p).stages.hypothesis;
    expect(flat.complete).toBe(false);
    expect(flat.issues.some((i) => i.ruleId === 'hypothesis_direction')).toBe(true);

    p.hypothesis = 'Bubbles';
    const oneWord = validatePlan(p).stages.hypothesis;
    expect(oneWord.complete).toBe(false);
    expect(oneWord.issues.some((i) => i.ruleId === 'hypothesis_empty')).toBe(true);
  });
});

describe('plan validation', () => {
  it('passes a complete, safe plan and allows the diagram', () => {
    const v = validatePlan(goodPlan());
    expect(v.safetyBlocks).toEqual([]);
    expect(v.canGenerateDiagram).toBe(true);
    expect(v.furthestUnlocked).toBe('summary');
  });

  it('keeps the diagram locked for an empty plan', () => {
    const v = validatePlan(emptyPlan());
    expect(v.canGenerateDiagram).toBe(false);
    expect(v.furthestUnlocked).toBe('theme');
  });

  it('locks summary and diagram while procedure is incomplete or unsafe (client skips the progress request)', () => {
    const p = goodPlan();
    p.procedure.push({ id: 's5', text: 'To test for starch, heat the leaf in ethanol over a Bunsen burner.' });
    const v = validatePlan(p);
    expect(isAppStageUnlocked(v, 'procedure')).toBe(true);
    expect(isAppStageUnlocked(v, 'summary')).toBe(false);
    expect(isAppStageUnlocked(v, 'diagram')).toBe(false);
    const ok = validatePlan(goodPlan());
    expect(isAppStageUnlocked(ok, 'summary')).toBe(true);
    expect(isAppStageUnlocked(ok, 'diagram')).toBe(true);
  });

  it('needs at least two controlled variables', () => {
    const p = goodPlan();
    p.variables.controlled = [{ id: 'c1', text: 'Temperature' }];
    const v = validatePlan(p);
    expect(v.stages.variables.complete).toBe(false);
    expect(v.canGenerateDiagram).toBe(false);
  });

  it('needs justifications for measuring instruments', () => {
    const p = goodPlan();
    p.apparatus.justifications = {};
    const v = validatePlan(p);
    expect(v.stages.apparatus.complete).toBe(false);
    expect(v.stages.apparatus.issues.some((i) => i.ruleId === 'justification_missing')).toBe(true);
  });

  it('gives specific praise for a precise instrument', () => {
    const v = validatePlan(goodPlan());
    expect(v.stages.apparatus.praise.join(' ')).toMatch(/metre rule because it measures more precisely/);
  });

  it('requires every checklist item', () => {
    const p = goodPlan();
    p.safety.checklist = {};
    expect(validatePlan(p).stages.safety.complete).toBe(false);
  });
});

describe('hazard detection', () => {
  it('blocks heating ethanol with a Bunsen flame in the procedure', () => {
    const p = goodPlan();
    p.procedure.push({ id: 's5', text: 'Heat the leaf in ethanol over a Bunsen burner.' });
    const v = validatePlan(p);
    const block = v.safetyBlocks.find((b) => b.ruleId === 'ethanol_flame');
    expect(block?.stage).toBe('procedure');
    expect(block?.severity).toBe('safety_block');
    expect(block?.alternative).toMatch(/water bath/);
    expect(v.stages.procedure.complete).toBe(false);
    expect(v.canGenerateDiagram).toBe(false);
  });

  it('allows ethanol in a hot water bath with the burner off', () => {
    const p = goodPlan();
    p.procedure.push({
      id: 's5',
      text: 'Turn off the Bunsen burner. Warm the leaf in ethanol in a hot water bath.',
    });
    expect(detectPlanHazards(p).filter((b) => b.ruleId === 'ethanol_flame')).toEqual([]);
  });

  it('blocks ethanol plus Bunsen burner apparatus without saying it is off', () => {
    const p = goodPlan();
    p.apparatus.selected.push('ethanol-tube', 'bunsen-burner');
    const blocks = detectPlanHazards(p);
    expect(blocks.some((b) => b.ruleId === 'ethanol_flame' && b.stage === 'apparatus')).toBe(true);
  });

  it('does not flag a negated warning', () => {
    expect(hasUnnegated('Never taste the solution.', /\btaste\b/i)).toBe(false);
    const p = goodPlan();
    p.procedure.push({ id: 's5', text: 'Never taste or smell the chemicals.' });
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'taste_smell')).toBe(false);
  });

  it('blocks tasting chemicals and home experiments', () => {
    const p = goodPlan();
    p.procedure.push({ id: 's5', text: 'Taste the solution to check it.' });
    p.procedure.push({ id: 's6', text: 'Do the test again at home in my kitchen.' });
    const ids = detectPlanHazards(p).map((b) => b.ruleId);
    expect(ids).toContain('taste_smell');
    expect(ids).toContain('home_experiment');
  });

  it('blocks unsuitable gas collection', () => {
    const p = goodPlan();
    p.procedure.push({ id: 's5', text: 'Collect the oxygen gas in a plastic bag.' });
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'gas_collection')).toBe(true);
    p.procedure[4].text = 'Collect the oxygen in an inverted measuring cylinder full of water.';
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'gas_collection')).toBe(false);
  });

  it('requires dilute hydrogen peroxide and goggles', () => {
    const p = goodPlan();
    p.theme.theme = 'enzyme';
    p.apparatus.selected = ['test-tube', 'stopwatch'];
    p.safety.checklist = {};
    p.procedure.push({ id: 's5', text: 'Add concentrated hydrogen peroxide to the potato.' });
    const ids = detectPlanHazards(p).map((b) => b.ruleId);
    expect(ids).toContain('peroxide_concentration');
    expect(ids).toContain('eye_protection');
  });

  it('requires gloves or tongs when heating', () => {
    const p = goodPlan();
    p.apparatus.selected.push('bunsen-burner');
    p.procedure.push({ id: 's5', text: 'Heat the water to 30 °C with the Bunsen burner.' });
    p.safety.checklist['hot-hands'] = false;
    expect(detectPlanHazards(p).some((b) => b.ruleId === 'hot_glassware')).toBe(true);
    expect(safetyChecklist(p).some((i) => i.id === 'hot-hands')).toBe(true);
  });
});

function scene(items: Scene['items'], extra: Partial<Scene> = {}): Scene {
  return { items, containment: [], connections: [], labels: [], ...extra };
}

describe('diagram checks', () => {
  const plan = goodPlan();

  it('blocks ethanol above a Bunsen burner', () => {
    const s = scene([
      { id: 'b', apparatusId: 'bunsen-burner', x: 400, y: 430, rotation: 0, label: 'Bunsen burner' },
      { id: 'e', apparatusId: 'ethanol-tube', x: 410, y: 250, rotation: 0, label: 'Ethanol' },
      { id: 'g', apparatusId: 'safety-goggles', x: 50, y: 540, rotation: 0, label: 'Goggles' },
    ]);
    const checks = checkDiagram(s, plan);
    const c = checks.find((x) => x.ruleId === 'diagram_ethanol_flame')!;
    expect(c.passed).toBe(false);
    expect(c.alternative).toMatch(/hot water/);
    expect(hasSafetyBlock(checks)).toBe(true);
  });

  it('passes ethanol in a water bath far from any burner', () => {
    const s = scene([
      { id: 'w', apparatusId: 'beaker', x: 100, y: 440, rotation: 0, label: 'Hot water' },
      { id: 'e', apparatusId: 'ethanol-tube', x: 140, y: 404, rotation: 0, label: 'Ethanol' },
      { id: 'g', apparatusId: 'safety-goggles', x: 50, y: 540, rotation: 0, label: 'Goggles' },
    ]);
    expect(hasSafetyBlock(checkDiagram(s, plan))).toBe(false);
  });

  it('blocks a heat source with no goggles', () => {
    const s = scene([{ id: 'b', apparatusId: 'bunsen-burner', x: 400, y: 430, rotation: 0, label: 'Burner' }]);
    const c = checkDiagram(s, plan).find((x) => x.ruleId === 'diagram_eye_protection')!;
    expect(c.passed).toBe(false);
  });

  it('blocks a delivery tube that leads nowhere suitable', () => {
    const s = scene(
      [
        { id: 't', apparatusId: 'delivery-tube', x: 100, y: 400, rotation: 0, label: 'Tube' },
        { id: 'b', apparatusId: 'beaker', x: 300, y: 440, rotation: 0, label: 'Beaker' },
      ],
      { connections: [{ fromId: 't', toId: 'b' }] },
    );
    expect(checkDiagram(s, plan).find((c) => c.ruleId === 'diagram_gas_collection')?.passed).toBe(false);
    s.items.push({ id: 'g', apparatusId: 'gas-syringe', x: 300, y: 300, rotation: 0, label: 'Syringe' });
    s.connections = [{ fromId: 't', toId: 'g' }];
    expect(checkDiagram(s, plan).find((c) => c.ruleId === 'diagram_gas_collection')?.passed).toBe(true);
  });

  it('asks a Socratic question when the measuring tool is missing', () => {
    const p = goodPlan();
    p.variables.dependent = 'Temperature of the water after 10 minutes';
    const checks = checkDiagram(scene([]), p);
    const c = checks.find((x) => x.ruleId === 'consistency_temperature')!;
    expect(c.passed).toBe(false);
    expect(c.message).toBe('Your plan says you measure temperature. Where does your diagram show how?');
    expect(c.severity).toBe('hint');
  });

  it('counting bubbles per minute needs a stopwatch, not a gas collector', () => {
    const checks = checkDiagram(scene([]), goodPlan());
    expect(checks.some((c) => c.ruleId === 'consistency_the_volume_of_gas')).toBe(false);
    expect(checks.find((c) => c.ruleId === 'consistency_time')?.passed).toBe(false);
  });

  it('flags unlabelled items as a hint', () => {
    const s = scene([{ id: 'a', apparatusId: 'beaker', x: 0, y: 0, rotation: 0, label: '' }]);
    const c = checkDiagram(s, plan).find((x) => x.ruleId === 'completeness_labels')!;
    expect(c.passed).toBe(false);
    expect(c.severity).toBe('hint');
  });
});

describe('scene helpers', () => {
  it('snaps a thermometer into a beaker and records containment', () => {
    const s = scene([
      { id: 'b', apparatusId: 'beaker', x: 100, y: 440, rotation: 0, label: 'Beaker' },
      { id: 't', apparatusId: 'thermometer', x: 600, y: 100, rotation: 0, label: 'Thermometer' },
    ]);
    const next = placeInside(s, 't', 'b');
    expect(next.containment).toEqual([{ childId: 't', parentId: 'b' }]);
    const t = next.items.find((i) => i.id === 't')!;
    expect(t.x).toBe(100 + 84 - 8);
  });

  it('refuses containment the library does not allow', () => {
    const s = scene([
      { id: 'b', apparatusId: 'beaker', x: 100, y: 440, rotation: 0, label: 'Beaker' },
      { id: 'm', apparatusId: 'metre-rule', x: 600, y: 100, rotation: 0, label: 'Rule' },
    ]);
    expect(placeInside(s, 'm', 'b').containment).toEqual([]);
  });

  it('sanitises an untrusted scene', () => {
    expect(() => sanitizeScene({ items: [{ id: 'x', apparatusId: 'rocket', x: 0, y: 0 }] })).toThrow();
    const clean = sanitizeScene({
      items: [{ id: 'x', apparatusId: 'beaker', x: '12.4', y: 3, rotation: 0, label: 'A\u0000b' }],
      containment: [{ childId: 'x', parentId: 'nope' }],
    });
    expect(clean.items[0]).toMatchObject({ x: 12, label: 'Ab' });
    expect(clean.containment).toEqual([]);
  });
});
