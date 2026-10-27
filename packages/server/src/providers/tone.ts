import { containsGood, notYetReply, withoutGoodSentences, type ChatRequest } from '@labguide/shared';
import type { TutorDraft } from './types.js';

type TurnType = ChatRequest['type'];

/**
 * Stops a tutor reply from calling a failed answer correct.
 * Hint 1 and hint 2 never say Good. A check of work that still has problems starts with "Not yet."
 */
export function applyTutorTone(
  draft: TutorDraft,
  opts: { problems: boolean; request: TurnType; hintLevel?: number },
): TutorDraft {
  if (opts.request === 'hint' && (opts.hintLevel === 1 || opts.hintLevel === 2)) {
    const text = withoutGoodSentences(draft.text) || 'You have made a start. Think about this practical.';
    const questions = draft.questions.filter((q) => !containsGood(q));
    return { ...draft, text, questions: questions.length ? questions : ['What will you look at?'] };
  }
  if (opts.request === 'enter') {
    const text = withoutGoodSentences(draft.text);
    const questions = draft.questions.filter((q) => !containsGood(q));
    if (!text && questions.length === 0) return { ...draft, text: 'Hello. I will ask questions to help you plan.', questions: ['What will you look at?'] };
    return { ...draft, text: text || draft.text, questions };
  }
  const blob = `${draft.text}\n${draft.questions.join('\n')}`;
  const already = draft.text.startsWith('Not yet.') && !containsGood(blob);
  if (opts.request === 'check' && opts.problems) {
    if (already) return { ...draft, questions: draft.questions.filter((q) => !containsGood(q)) };
    const kept = draft.questions.find((q) => !containsGood(q));
    return { ...draft, kind: 'socratic', text: notYetReply(kept || 'Say what you need to change.'), questions: [] };
  }
  if (opts.problems && containsGood(blob)) {
    const kept = draft.questions.find((q) => !containsGood(q));
    return { ...draft, kind: draft.kind === 'hint' ? draft.kind : 'socratic', text: notYetReply(kept || 'Say what you need to change.'), questions: [] };
  }
  return draft;
}
