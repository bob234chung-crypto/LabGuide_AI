export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

const NEGATORS = /\b(not|never|no|don't|dont|do not|avoid|without|must not|mustn't|cannot|can't)\b[^.;!?]*$/i;

/**
 * True if `pattern` appears in `text` at least once without a negation word
 * shortly before it in the same clause ("never heat ethanol" is negated).
 */
export function hasUnnegated(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATORS.test(before)) return true;
    if (m[0].length === 0) re.lastIndex++;
  }
  return false;
}

export function includesAny(text: string, words: string[]): boolean {
  const t = ` ${normalise(text)} `;
  return words.some((w) => t.includes(w.toLowerCase()));
}

export function sentenceCase(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
