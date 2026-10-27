import type { AnswerBoxKind } from '../types.js';

/** The word "good" as praise, not as part of a longer word. */
const GOOD_WORD = /\bgood\b/i;

export function containsGood(text: string): boolean {
  return GOOD_WORD.test(text);
}

/** Drop the word Good, then keep one sentence. */
function scrub(text: string): string {
  return text.replace(/\bgood\b/gi, '').replace(/\s+/g, ' ').replace(/\s+([.!?])/g, '$1').trim();
}

/** A line that treats the student's words as already correct. */
const RESTS_WRONG = /^(you will|you chose|you named|you said|you wrote|you have|you are)\b/i;

/**
 * One instruction about what to change. It does not restate a wrong idea as the answer,
 * and it never contains the word Good.
 */
export function toInstruction(question: string): string {
  const cleaned = scrub(question).replace(/^[.\s]+/, '');
  if (containsGood(question) || RESTS_WRONG.test(cleaned)) {
    return 'Say what this card should show about your test.';
  }
  const first = cleaned.split('?')[0]?.trim() ?? '';
  let s = first
    .replace(/^what will you /i, 'Say what you will ')
    .replace(/^what is the /i, 'Name the ')
    .replace(/^what is /i, 'Name ')
    .replace(/^what do you /i, 'Say what you ')
    .replace(/^what does /i, 'Say what ')
    .replace(/^what are you /i, 'Say what you are ')
    .replace(/^what could /i, 'Say what could ')
    .replace(/^how does /i, 'Explain how ')
    .replace(/^how do /i, 'Explain how ')
    .replace(/^how will you /i, 'Say how you will ')
    .replace(/^how would you /i, 'Say how you would ')
    .replace(/^which /i, 'Name which ')
    .replace(/^can you /i, 'Check whether you can ')
    .replace(/^why /i, 'Say why ')
    .replace(/^does your /i, 'Check whether your ')
    .replace(/^do your /i, 'Check whether your ');
  s = s.replace(/[.!]+$/g, '').trim();
  if (!s || containsGood(s)) s = 'Say what this card should show about your test';
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/** The only wording for a card that did not pass. The word Good is never included. */
export function notYetReply(question: string): string {
  const text = `Not yet. You have made a start. ${toInstruction(question)}`;
  if (containsGood(text)) return 'Not yet. You have made a start. Say what this card should show about your test.';
  return text;
}

function clip(text: string): string {
  const words = scrub(text).replace(/[.!?]+$/g, '').split(' ').filter(Boolean).slice(0, 12);
  return words.join(' ') || 'this';
}

/** Praise for one card that passed. Names what that card got right. */
export function goodCardReply(kind: AnswerBoxKind, text: string): string {
  const bit = clip(text);
  const specific: Record<AnswerBoxKind, string> = {
    hypothesis: 'You said what you will change and what you will look at.',
    independent: `You will change ${bit}.`,
    dependent: `You will look at ${bit}.`,
    controlled: `You will keep ${bit} the same.`,
    justification: 'You said what this equipment is for.',
    step: 'You said what you will do in this step.',
  };
  return `Good. ${specific[kind]}`;
}

/** Remove sentences that say Good or treat the student's idea as already correct. */
export function withoutGoodSentences(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !containsGood(s) && !RESTS_WRONG.test(s.replace(/^[.\s]+/, '')))
    .join(' ')
    .trim();
}
