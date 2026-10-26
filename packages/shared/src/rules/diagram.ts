import { apparatusName, getApparatus } from '../apparatus.js';
import type { DiagramCheck, Plan, Scene, SceneItem } from '../types.js';
import { normalise } from './text.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function itemBox(item: SceneItem): Box {
  const a = getApparatus(item.apparatusId);
  const w = a?.width ?? 40;
  const h = a?.height ?? 40;
  const quarter = Math.round(((item.rotation % 360) + 360) % 360 / 90) % 2 === 1;
  if (!quarter) return { x: item.x, y: item.y, w, h };
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  return { x: cx - h / 2, y: cy - w / 2, w: h, h: w };
}

function horizontalOverlap(a: Box, b: Box, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin;
}

/** True if box a sits above box b (a's bottom is at or above b's top) and they overlap sideways. */
export function isAbove(a: Box, b: Box): boolean {
  return horizontalOverlap(a, b, 10) && a.y + a.h <= b.y + 30;
}

function horizontalGap(a: Box, b: Box): number {
  if (horizontalOverlap(a, b)) return 0;
  return a.x > b.x ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
}

export function ancestors(scene: Scene, itemId: string): string[] {
  const out: string[] = [];
  let cur = itemId;
  for (let i = 0; i < 20; i++) {
    const link = scene.containment.find((c) => c.childId === cur);
    if (!link) break;
    out.push(link.parentId);
    cur = link.parentId;
  }
  return out;
}

const MEASURE_RULES: { words: RegExp; quantity: string; tools: string[] }[] = [
  { words: /\b(temperature|°c|degrees|hot|cold|warm|cool)\b/i, quantity: 'temperature', tools: ['thermometer'] },
  {
    words: /\b(volume|cm3|cm³|collect|collected|gas syringe)\b/i,
    quantity: 'the volume of gas',
    tools: ['gas-syringe', 'inverted-measuring-cylinder', 'measuring-cylinder'],
  },
  { words: /\b(mass|grams|weigh|weight)\b/i, quantity: 'mass', tools: ['electronic-balance'] },
  { words: /\b(time|seconds|minutes?|per minute|how long|rate|speed|how fast)\b/i, quantity: 'time', tools: ['stopwatch'] },
  { words: /\b(distance|light intensity|cm from)\b/i, quantity: 'distance', tools: ['metre-rule'] },
];

/** Deterministic, server-side diagram checks. Hints are questions; safety blocks are plain. */
export function checkDiagram(scene: Scene, plan: Plan): DiagramCheck[] {
  const checks: DiagramCheck[] = [];
  const items = scene.items;
  const byApp = (pred: (id: string) => boolean) => items.filter((i) => pred(i.apparatusId));
  const flags = (i: SceneItem) => getApparatus(i.apparatusId) ?? null;

  /* --- Safety blocks --- */
  const burners = byApp((id) => id === 'bunsen-burner');
  const flammables = items.filter((i) => flags(i)?.flammable);
  const unsafeEthanol: string[] = [];
  const nearEthanol: string[] = [];
  for (const e of flammables) {
    for (const b of burners) {
      if (isAbove(itemBox(e), itemBox(b))) unsafeEthanol.push(e.id, b.id);
      else if (horizontalGap(itemBox(e), itemBox(b)) < 120) nearEthanol.push(e.id, b.id);
    }
  }
  checks.push({
    ruleId: 'diagram_ethanol_flame',
    severity: 'safety_block',
    passed: unsafeEthanol.length === 0,
    itemIds: unsafeEthanol,
    message: unsafeEthanol.length
      ? 'Stop. Your diagram heats ethanol over a Bunsen burner flame. Do not do this.'
      : flammables.length
        ? 'Good. The ethanol is not above a flame.'
        : 'No flammable liquid is above a flame.',
    hazard: unsafeEthanol.length ? 'Ethanol is flammable. Its vapour can catch fire.' : undefined,
    alternative: unsafeEthanol.length
      ? 'Put the tube of ethanol in a beaker of hot water (a hot water bath). Remove the Bunsen burner, or turn it off and move it away.'
      : undefined,
  });
  if (!unsafeEthanol.length && nearEthanol.length) {
    checks.push({
      ruleId: 'diagram_ethanol_near_flame',
      severity: 'safety_block',
      passed: false,
      itemIds: nearEthanol,
      message: 'The ethanol is too close to a Bunsen burner.',
      hazard: 'Ethanol vapour can travel to a flame and catch fire.',
      alternative: 'Move the Bunsen burner far away from the ethanol, or remove it. Use hot water from the teacher instead.',
    });
  }

  const heated = items.filter((i) => flags(i)?.heatSource);
  const goggles = items.some((i) => flags(i)?.eyeProtection);
  const peroxide = byApp((id) => id === 'hydrogen-peroxide');
  const needsEyes = heated.length > 0 || peroxide.length > 0;
  checks.push({
    ruleId: 'diagram_eye_protection',
    severity: 'safety_block',
    passed: !needsEyes || goggles,
    itemIds: needsEyes && !goggles ? [...heated, ...peroxide].map((i) => i.id) : [],
    message:
      needsEyes && !goggles
        ? heated.length
          ? 'Your diagram heats something, but nobody is wearing eye protection.'
          : 'Your diagram uses hydrogen peroxide, but there is no eye protection.'
        : 'Eye protection is shown where it is needed.',
    hazard: needsEyes && !goggles ? 'Hot liquid or chemicals can splash into your eyes.' : undefined,
    alternative: needsEyes && !goggles ? 'Add safety goggles to your diagram.' : undefined,
  });

  const sodaLime = items.filter((i) => flags(i)?.corrosive);
  if (sodaLime.length && !goggles) {
    checks.push({
      ruleId: 'diagram_soda_lime',
      severity: 'safety_block',
      passed: false,
      itemIds: sodaLime.map((i) => i.id),
      message: 'Soda lime is on your diagram, but there is no eye protection.',
      hazard: 'Soda lime is corrosive. It can burn skin and eyes.',
      alternative: 'Add safety goggles. Your teacher handles the soda lime. Do not touch it.',
    });
  }

  const bareSplint = items.filter((i) => flags(i)?.teacherDemo && !/\bteacher\b/i.test(i.label));
  if (bareSplint.length) {
    checks.push({
      ruleId: 'diagram_splint_teacher',
      severity: 'safety_block',
      passed: false,
      itemIds: bareSplint.map((i) => i.id),
      message: 'Label the glowing splint as a teacher demonstration.',
      hazard: 'A glowing splint is done by the teacher, not by a student alone.',
      alternative: 'Keep the word teacher in the label, or write that your teacher does the splint test.',
    });
  }

  const tubes = byApp((id) => id === 'delivery-tube');
  const badTubes = tubes.filter((t) => {
    const linked = scene.connections
      .filter((c) => c.fromId === t.id || c.toId === t.id)
      .map((c) => (c.fromId === t.id ? c.toId : c.fromId))
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is SceneItem => !!i);
    return !linked.some((i) => flags(i)?.gasCollector);
  });
  if (tubes.length) {
    checks.push({
      ruleId: 'diagram_gas_collection',
      severity: 'safety_block',
      passed: badTubes.length === 0,
      itemIds: badTubes.map((t) => t.id),
      message: badTubes.length
        ? 'The delivery tube does not lead to a suitable gas collector.'
        : 'Good. The gas goes into a suitable collector.',
      hazard: badTubes.length ? 'Gas escapes into the room and cannot be measured.' : undefined,
      alternative: badTubes.length
        ? 'Connect the delivery tube to a gas syringe, or to an inverted measuring cylinder full of water.'
        : undefined,
    });
  }

  /* --- Consistency with the plan (Socratic) --- */
  const measured = `${plan.variables.dependent} ${plan.variables.independent} ${plan.variables.controlled
    .map((c) => c.text)
    .join(' ')}`;
  for (const rule of MEASURE_RULES) {
    if (!rule.words.test(measured)) continue;
    const present = items.some((i) => rule.tools.includes(i.apparatusId));
    const inDv = rule.words.test(plan.variables.dependent);
    checks.push({
      ruleId: `consistency_${rule.quantity.replace(/\W+/g, '_')}`,
      severity: 'hint',
      passed: present,
      message: present
        ? `Your diagram shows how you measure ${rule.quantity}.`
        : `Your plan says you measure ${rule.quantity}. Where does your diagram show how?`,
    });
    if (inDv && !present) {
      checks.push({
        ruleId: 'completeness_dv_tool',
        severity: 'hint',
        passed: false,
        message: 'Which piece of apparatus measures your dependent variable? Is it in your diagram?',
      });
    }
  }
  const missingFromPlan = plan.apparatus.selected.filter(
    (id) => !items.some((i) => i.apparatusId === id) && !getApparatus(id)?.common,
  );
  if (missingFromPlan.length) {
    checks.push({
      ruleId: 'consistency_plan_items',
      severity: 'info',
      passed: false,
      message: `Your plan lists ${missingFromPlan
        .slice(0, 3)
        .map((id) => apparatusName(id).toLowerCase())
        .join(', ')}. Do you need ${missingFromPlan.length > 1 ? 'them' : 'it'} in your diagram?`,
    });
  }

  /* --- Completeness --- */
  const unlabelled = items.filter((i) => !normalise(i.label));
  checks.push({
    ruleId: 'completeness_labels',
    severity: 'hint',
    passed: unlabelled.length === 0,
    itemIds: unlabelled.map((i) => i.id),
    message: unlabelled.length
      ? `${unlabelled.length} item${unlabelled.length > 1 ? 's have' : ' has'} no label. How will a reader know what ${unlabelled.length > 1 ? 'they are' : 'it is'}?`
      : 'Every item has a label.',
  });
  if (heated.length && !items.some((i) => flags(i)?.handProtection) && plan.theme.theme !== 'enzyme') {
    checks.push({
      ruleId: 'completeness_hot_hands',
      severity: 'hint',
      passed: false,
      message: 'How will you hold hot glassware safely? Could you show it?',
    });
  }
  if (items.length === 0) {
    checks.push({
      ruleId: 'completeness_empty',
      severity: 'info',
      passed: false,
      message: 'Your canvas is empty. Which piece of apparatus will you place first?',
    });
  }
  return checks;
}

export function hasSafetyBlock(checks: DiagramCheck[]): boolean {
  return checks.some((c) => c.severity === 'safety_block' && !c.passed);
}

export function emptyScene(): Scene {
  return { items: [], containment: [], connections: [], labels: [] };
}
