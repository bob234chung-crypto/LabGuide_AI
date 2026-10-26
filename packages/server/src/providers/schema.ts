import type { TutorReplyKind } from '@labguide/shared';
import { ProviderError, type PlanReview, type TutorDraft } from './types.js';

const KINDS: TutorReplyKind[] = ['socratic', 'hint', 'praise', 'safety', 'greeting'];
export const MAX_QUESTIONS = 3;
const MAX_TEXT = 700;
const MAX_QUESTION = 200;

const clean = (s: unknown) =>
  String(typeof s === 'string' || typeof s === 'number' ? s : '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`#]+/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const asQuestion = (q: string) => (q.endsWith('?') ? q : `${q}?`);

/**
 * Model output is untrusted. Enforce the tutor contract server-side: plain text only, known
 * kinds, at most 3 questions per reply. A reply whose question list is too long is repaired
 * (extra questions dropped); a reply whose text alone asks more than 3 questions is rejected.
 */
export function validateTutorDraft(raw: unknown): TutorDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProviderError('Tutor reply was not an object', true, 'invalid_output');
  }
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind) as TutorReplyKind;
  if (!KINDS.includes(kind)) throw new ProviderError('Unknown reply kind', true, 'invalid_output');
  if (r.questions !== undefined && !Array.isArray(r.questions)) {
    throw new ProviderError('questions must be a list', true, 'invalid_output');
  }
  const text = clean(r.text).slice(0, MAX_TEXT);
  const inlineQuestions = (text.match(/\?/g) ?? []).length;
  if (inlineQuestions > MAX_QUESTIONS) {
    throw new ProviderError('Too many questions in one reply', true, 'invalid_output');
  }
  const questions = ((r.questions as unknown[] | undefined) ?? [])
    .map((q) => clean(q).slice(0, MAX_QUESTION))
    .filter(Boolean)
    .map(asQuestion)
    .slice(0, MAX_QUESTIONS - inlineQuestions);
  if (!text && questions.length === 0) throw new ProviderError('Empty tutor reply', true, 'invalid_output');
  const hintLevel = r.hintLevel === 1 || r.hintLevel === 2 || r.hintLevel === 3 ? r.hintLevel : undefined;
  return { kind, text, questions, hintLevel };
}

/** Schema for a stage quality review: { passed: boolean, feedbackQuestions: string[] (≤ 3) }. */
export function validateStageReview(raw: unknown): PlanReview {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProviderError('Review was not an object', true, 'invalid_output');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.passed !== 'boolean') throw new ProviderError('Review has no passed flag', true, 'invalid_output');
  if (r.feedbackQuestions !== undefined && !Array.isArray(r.feedbackQuestions)) {
    throw new ProviderError('feedbackQuestions must be a list', true, 'invalid_output');
  }
  const feedbackQuestions = ((r.feedbackQuestions as unknown[] | undefined) ?? [])
    .map((q) => clean(q).slice(0, MAX_QUESTION))
    .filter(Boolean)
    .map(asQuestion)
    .slice(0, MAX_QUESTIONS);
  return { passed: r.passed, feedbackQuestions: r.passed ? [] : feedbackQuestions };
}

/** Parses the model's JSON reply (tolerating a ```json fence). */
export function parseModelJson(content: unknown): unknown {
  if (typeof content !== 'string') throw new ProviderError('No reply content', true, 'invalid_output');
  const body = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(body);
  } catch {
    throw new ProviderError('Reply was not JSON', true, 'invalid_output');
  }
}
