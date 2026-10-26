import type { TutorReplyKind } from '@labguide/shared';
import { ProviderError, type TutorDraft } from './types.js';

const KINDS: TutorReplyKind[] = ['socratic', 'hint', 'praise', 'safety', 'greeting'];
export const MAX_QUESTIONS = 3;
const MAX_TEXT = 700;

/**
 * Model output is untrusted. Enforce the tutor contract server-side:
 * plain text only, known kinds, at most 3 questions per reply.
 */
export function validateTutorDraft(raw: unknown): TutorDraft {
  if (!raw || typeof raw !== 'object') throw new ProviderError('Tutor reply was not an object', true, 'invalid_output');
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind) as TutorReplyKind;
  if (!KINDS.includes(kind)) throw new ProviderError('Unknown reply kind', true, 'invalid_output');
  const clean = (s: unknown) =>
    String(s ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
      .trim();
  const text = clean(r.text).slice(0, MAX_TEXT);
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map(clean)
    .filter(Boolean)
    .map((q) => (q.endsWith('?') ? q : `${q}?`))
    .slice(0, MAX_QUESTIONS);
  const inlineQuestions = (text.match(/\?/g) ?? []).length;
  if (inlineQuestions + questions.length > MAX_QUESTIONS) {
    throw new ProviderError('Too many questions in one reply', true, 'invalid_output');
  }
  if (!text && questions.length === 0) throw new ProviderError('Empty tutor reply', true, 'invalid_output');
  const hintLevel = r.hintLevel === 1 || r.hintLevel === 2 || r.hintLevel === 3 ? r.hintLevel : undefined;
  return { kind, text, questions, hintLevel };
}
