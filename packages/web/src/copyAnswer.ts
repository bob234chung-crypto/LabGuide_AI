/** Puts a chosen sentence into an answer box. An empty box is filled. Existing words are kept. */
export function applyCopiedSentence(current: string, sentence: string): string {
  const next = sentence.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  if (current.includes(next)) return current;
  return `${current.trim()} ${next}`;
}
