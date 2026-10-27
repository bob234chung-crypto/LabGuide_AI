import {
  PLAN_STAGES,
  type AppStage,
  type Plan,
  type PlanStage,
  type PlanValidation,
  type ReviewedStage,
  type StageReview,
} from '../types.js';
import { normalise } from './text.js';

export const REVIEWED_STAGES: readonly ReviewedStage[] = ['hypothesis', 'variables', 'apparatus', 'procedure', 'summary'];

export type StageReviews = Partial<Record<ReviewedStage, StageReview>> | undefined;

export function isReviewedStage(stage: string): stage is ReviewedStage {
  return (REVIEWED_STAGES as readonly string[]).includes(stage);
}

/** Sorted-key JSON with normalised strings, so the browser and the server fingerprint the same answers alike. */
function stable(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(normalise(value));
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const nonEmpty = <T extends { text: string }>(cards: T[]) => cards.filter((c) => c.text.trim()).map((c) => c.text);

/**
 * Fingerprint of everything a stage review looked at. Later stages include the earlier answers
 * they must agree with, so changing the hypothesis also re-opens the variables review.
 */
export function stageAnswerKey(plan: Plan, stage: ReviewedStage): string {
  const vars = { iv: plan.variables.independent, dv: plan.variables.dependent, cv: plan.variables.controlled.map((c) => c.text) };
  const app = { sel: [...plan.apparatus.selected].sort(), just: plan.apparatus.justifications };
  const parts: Record<ReviewedStage, unknown> = {
    hypothesis: [plan.theme, plan.hypothesis],
    variables: [plan.hypothesis, vars],
    apparatus: [vars, app],
    procedure: [vars, app.sel, nonEmpty(plan.procedure)],
    summary: [plan.theme, plan.hypothesis, vars, app, nonEmpty(plan.procedure)],
  };
  const text = `${stage}|${stable(parts[stage])}`;
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x01234567);
}

/** Fingerprint of one card, so two cards with the same words do not share a result. */
export function boxAnswerKey(theme: string | null, boxId: string, text: string): string {
  const body = `${theme ?? ''}|${boxId}|${stable(text)}`;
  return fnv1a(body, 0x811c9dc5);
}

/** A passed review that still matches the current answers. */
export function reviewPassed(plan: Plan, reviews: StageReviews, stage: ReviewedStage): boolean {
  const r = reviews?.[stage];
  return !!r && r.passed && r.answerKey === stageAnswerKey(plan, stage);
}

/** A stage counts as done when the rules pass and, for reviewed stages, the quality review passed. */
export function stageDone(v: PlanValidation, plan: Plan, reviews: StageReviews, stage: PlanStage): boolean {
  if (!v.stages[stage].complete) return false;
  return !isReviewedStage(stage) || stage === 'summary' || reviewPassed(plan, reviews, stage);
}

/**
 * The furthest stage the student may open. The deterministic rules come first and always win;
 * a quality review can only hold the student back further, never unlock a stage the rules lock.
 */
export function gatedFurthest(v: PlanValidation, plan: Plan, reviews: StageReviews): PlanStage {
  const ruleIdx = PLAN_STAGES.indexOf(v.furthestUnlocked);
  for (let i = 0; i < ruleIdx; i++) {
    const s = PLAN_STAGES[i];
    if (!stageDone(v, plan, reviews, s)) return s;
  }
  return v.furthestUnlocked;
}

export function canOpenDiagram(v: PlanValidation, plan: Plan, reviews: StageReviews): boolean {
  return v.canGenerateDiagram && gatedFurthest(v, plan, reviews) === 'summary' && reviewPassed(plan, reviews, 'summary');
}

export function isGatedStageUnlocked(v: PlanValidation, plan: Plan, reviews: StageReviews, stage: AppStage): boolean {
  if (stage === 'diagram') return canOpenDiagram(v, plan, reviews);
  return PLAN_STAGES.indexOf(stage) <= PLAN_STAGES.indexOf(gatedFurthest(v, plan, reviews));
}

/** The reviewed stages that must pass before the student may open `target`, in order. */
export function reviewsNeededFor(target: AppStage): ReviewedStage[] {
  if (target === 'diagram') return [...REVIEWED_STAGES];
  const idx = PLAN_STAGES.indexOf(target);
  return REVIEWED_STAGES.filter((s) => s !== 'summary' && PLAN_STAGES.indexOf(s) < idx);
}
