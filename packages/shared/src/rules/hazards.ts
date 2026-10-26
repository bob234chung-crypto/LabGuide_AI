import { getApparatus } from '../apparatus.js';
import type { ChecklistItem, Issue, Plan, PlanStage } from '../types.js';
import { hasUnnegated } from './text.js';

interface Segment {
  stage: PlanStage;
  field: string;
  text: string;
}

export function planSegments(plan: Plan): Segment[] {
  const segs: Segment[] = [
    { stage: 'hypothesis', field: 'hypothesis', text: plan.hypothesis },
    { stage: 'variables', field: 'independent', text: plan.variables.independent },
    { stage: 'variables', field: 'dependent', text: plan.variables.dependent },
    ...plan.variables.controlled.map((c) => ({ stage: 'variables' as const, field: c.id, text: c.text })),
    ...Object.entries(plan.apparatus.justifications)
      .filter(([id]) => plan.apparatus.selected.includes(id))
      .map(([id, text]) => ({ stage: 'apparatus' as const, field: id, text })),
    ...plan.procedure.map((s) => ({ stage: 'procedure' as const, field: s.id, text: s.text })),
  ];
  return segs.filter((s) => s.text && s.text.trim());
}

const ETHANOL = /\b(ethanol|alcohol|methylated spirits?|meths)\b/i;
const FLAME = /\b(bunsen|flame|burner|fire|naked flame|directly heat|heat (it )?directly)\b/i;
const HEAT = /\b(heat|heats|heating|heated|boil|boils|boiling|warm|warms|warming)\b/i;
const WATER_BATH = /(water bath|hot water|boiling water|beaker of (hot )?water)/i;
const BURNER_OFF = /(turn(ed)? (it )?off|switch(ed)? (it )?off|put (it )?out|turned-off|away from|far from)/i;
const HEATING_ANY = /\b(heat|heats|heating|heated|boil|boiling|bunsen|burner|flame|hot water|water bath|hot|warm)\b/i;
const EYE = /\b(goggles|eye protection|safety glasses|safety spectacles)\b/i;
const HANDS = /\b(gloves|tongs|heat-resistant|heat resistant)\b/i;
const COLLECT = /\bcollect(s|ed|ing)?\b/i;
const GAS = /\b(gas|oxygen|carbon dioxide|hydrogen|bubbles)\b/i;
const GOOD_COLLECTOR = /(gas syringe|syringe|inverted|upside[- ]down|upturned|over water|under water)/i;
const BAD_COLLECTOR = /\b(in|into|inside|with)\s+(a|an|the|my)?\s*(open beaker|beaker|plastic bag|bag|balloon|cup|jar|hand|hands|mouth|bottle)\b/i;
const PEROXIDE = /\b(hydrogen peroxide|h2o2|h₂o₂)\b/i;
const CONCENTRATED = /\b(concentrated|strong|30 ?%|high[- ]concentration|pure)\b/i;
const DILUTE = /\b(dilute|diluted|weak|low concentration|[1-6] ?%)\b/i;
const TASTE = /\b(taste|tastes|tasting|lick|licking|drink|drinking|eat|eating|smell|smells|smelling|sniff|sniffing|inhale)\b/i;
const HOME = /\b(at home|my home|in (my|the) kitchen|my house|home experiment|in my bedroom|in the bathroom)\b/i;

function hasApparatus(plan: Plan, pred: (id: string) => boolean): boolean {
  return plan.apparatus.selected.some(pred);
}

export interface HazardContext {
  usesEthanol: boolean;
  usesHeat: boolean;
  usesPeroxide: boolean;
  collectsGas: boolean;
  hasEye: boolean;
  hasHands: boolean;
}

export function hazardContext(plan: Plan): HazardContext {
  const segs = planSegments(plan);
  const all = segs.map((s) => s.text).join(' \n ');
  const usesEthanol =
    hasApparatus(plan, (id) => !!getApparatus(id)?.flammable) || segs.some((s) => hasUnnegated(s.text, ETHANOL));
  const usesHeat =
    hasApparatus(plan, (id) => !!getApparatus(id)?.heatSource) ||
    plan.theme.theme === 'insulation' ||
    segs.some((s) => hasUnnegated(s.text, HEATING_ANY));
  const usesPeroxide = hasApparatus(plan, (id) => id === 'hydrogen-peroxide') || PEROXIDE.test(all);
  const collectsGas = segs.some((s) => COLLECT.test(s.text) && GAS.test(s.text));
  const hasEye =
    hasApparatus(plan, (id) => !!getApparatus(id)?.eyeProtection) || EYE.test(all) || !!plan.safety.checklist['goggles'];
  const hasHands =
    hasApparatus(plan, (id) => !!getApparatus(id)?.handProtection) ||
    HANDS.test(all) ||
    !!plan.safety.checklist['hot-hands'];
  return { usesEthanol, usesHeat, usesPeroxide, collectsGas, hasEye, hasHands };
}

const ETHANOL_HAZARD = 'Ethanol is flammable. Its vapour can catch fire near a flame.';
const ETHANOL_ALT =
  'Put the tube of ethanol in a beaker of hot water (a hot water bath). Turn the Bunsen burner off and move it away from the ethanol first.';

/** Rule-based hazard detection over the student's own words. Deterministic. */
export function detectPlanHazards(plan: Plan): Issue[] {
  const issues: Issue[] = [];
  const segs = planSegments(plan);
  const ctx = hazardContext(plan);
  const seen = new Set<string>();
  const push = (i: Issue) => {
    const key = `${i.ruleId}:${i.stage}:${i.field ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({ ...i, severity: 'safety_block', required: true });
    }
  };

  for (const s of segs) {
    const t = s.text;
    const ethanolSentences = t.split(/(?<=[.!?;])\s+/).filter((sentence) => hasUnnegated(sentence, ETHANOL));
    if (ethanolSentences.length) {
      const unsafe = ethanolSentences.some((sentence) => {
        const directFlame = hasUnnegated(sentence, FLAME) && !BURNER_OFF.test(sentence);
        const heatNoBath = hasUnnegated(sentence, HEAT) && !WATER_BATH.test(sentence);
        return directFlame || heatNoBath;
      });
      if (unsafe) {
        push({
          ruleId: 'ethanol_flame',
          stage: s.stage,
          field: s.field,
          severity: 'safety_block',
          message: 'Stop. Do not heat ethanol with a flame.',
          hazard: ETHANOL_HAZARD,
          alternative: ETHANOL_ALT,
        });
      }
    }
    if (COLLECT.test(t) && GAS.test(t) && BAD_COLLECTOR.test(t) && !GOOD_COLLECTOR.test(t)) {
      push({
        ruleId: 'gas_collection',
        stage: s.stage,
        field: s.field,
        severity: 'safety_block',
        message: 'Do not collect the gas this way.',
        hazard: 'Gas escapes from an open or soft container. You cannot measure it, and some gases are harmful.',
        alternative: 'Use a gas syringe, or an inverted measuring cylinder or boiling tube filled with water.',
      });
    }
    if (PEROXIDE.test(t) && hasUnnegated(t, CONCENTRATED)) {
      push({
        ruleId: 'peroxide_concentration',
        stage: s.stage,
        field: s.field,
        severity: 'safety_block',
        message: 'Do not use concentrated hydrogen peroxide.',
        hazard: 'Concentrated hydrogen peroxide can burn your skin and eyes.',
        alternative: 'Use dilute hydrogen peroxide only (your teacher will give it to you) and wear safety goggles.',
      });
    }
    if (hasUnnegated(t, TASTE)) {
      push({
        ruleId: 'taste_smell',
        stage: s.stage,
        field: s.field,
        severity: 'safety_block',
        message: 'Never taste or smell chemicals directly.',
        hazard: 'Chemicals in the lab can be poisonous or harmful to breathe in.',
        alternative: 'Observe with your eyes and measure with apparatus. Ask your teacher if you need to check a smell safely.',
      });
    }
    if (hasUnnegated(t, HOME)) {
      push({
        ruleId: 'home_experiment',
        stage: s.stage,
        field: s.field,
        severity: 'safety_block',
        message: 'Do not do this experiment at home.',
        hazard: 'Homes do not have lab safety equipment or a teacher to help.',
        alternative: 'Do the experiment only in the school laboratory, with your teacher, following school lab rules.',
      });
    }
  }

  const ethanolAndBurner =
    hasApparatus(plan, (id) => !!getApparatus(id)?.flammable) && plan.apparatus.selected.includes('bunsen-burner');
  if (ethanolAndBurner && !segs.some((s) => BURNER_OFF.test(s.text))) {
    push({
      ruleId: 'ethanol_flame',
      stage: 'apparatus',
      field: 'bunsen-burner',
      severity: 'safety_block',
      message: 'Your plan has ethanol and a Bunsen burner. Do not heat the ethanol with the flame.',
      hazard: ETHANOL_HAZARD,
      alternative: ETHANOL_ALT + ' Say this in your procedure.',
    });
  }

  const mentionsPeroxide = segs.some((s) => PEROXIDE.test(s.text));
  if (
    mentionsPeroxide &&
    !plan.apparatus.selected.includes('hydrogen-peroxide') &&
    !segs.some((s) => DILUTE.test(s.text)) &&
    !plan.safety.checklist['peroxide-dilute']
  ) {
    push({
      ruleId: 'peroxide_concentration',
      stage: 'safety',
      severity: 'safety_block',
      message: 'Use dilute hydrogen peroxide only.',
      hazard: 'Strong hydrogen peroxide can burn skin and eyes.',
      alternative: 'Choose "Dilute hydrogen peroxide" and tick the checklist item about it.',
    });
  }

  if ((ctx.usesHeat || ctx.usesPeroxide) && !ctx.hasEye) {
    push({
      ruleId: 'eye_protection',
      stage: 'safety',
      severity: 'safety_block',
      message: 'You must wear eye protection for this experiment.',
      hazard: ctx.usesPeroxide
        ? 'Hydrogen peroxide can splash into your eyes.'
        : 'Hot liquids and hot glass can splash or crack.',
      alternative: 'Add safety goggles to your plan, or tick "I will wear safety goggles".',
    });
  }
  if (ctx.usesHeat && !ctx.hasHands) {
    push({
      ruleId: 'hot_glassware',
      stage: 'safety',
      severity: 'safety_block',
      message: 'Hot glassware needs heat-resistant gloves or tongs.',
      hazard: 'Hot glass looks the same as cold glass and can burn you.',
      alternative: 'Add heat-resistant gloves or tongs, or tick the checklist item about hot glassware.',
    });
  }
  return issues;
}

/** Safety checklist. Base items always apply; others appear when a rule needs them. */
export function safetyChecklist(plan: Plan): ChecklistItem[] {
  const ctx = hazardContext(plan);
  const items: ChecklistItem[] = [
    { id: 'school-lab', text: 'I will do this experiment only in the school laboratory, with my teacher.' },
    { id: 'lab-rules', text: 'I will follow my school lab rules.' },
    { id: 'goggles', text: 'I will wear safety goggles.' },
    { id: 'no-taste', text: 'I will never taste or smell chemicals directly.' },
    { id: 'spills', text: 'I will tell my teacher at once about any spill or broken glass.' },
  ];
  if (ctx.usesHeat) {
    items.push({
      id: 'hot-hands',
      text: 'I will use heat-resistant gloves or tongs to hold hot glassware.',
      reason: 'Your plan uses heat or hot water.',
    });
  }
  if (ctx.usesEthanol) {
    items.push({
      id: 'ethanol-away',
      text: 'I will keep ethanol away from flames and heat it only in a hot water bath.',
      reason: 'Your plan uses ethanol.',
    });
  }
  if (ctx.usesPeroxide) {
    items.push({
      id: 'peroxide-dilute',
      text: 'I will use dilute hydrogen peroxide only.',
      reason: 'Your plan uses hydrogen peroxide.',
    });
  }
  if (ctx.collectsGas) {
    items.push({
      id: 'gas-method',
      text: 'I will collect gas with a gas syringe or an inverted tube full of water.',
      reason: 'Your plan collects a gas.',
    });
  }
  return items;
}
