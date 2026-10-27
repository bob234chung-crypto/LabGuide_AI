import { describe, expect, it } from 'vitest';
import { applyCopiedSentence } from '../src/copyAnswer';

describe('copy into my answer', () => {
  it('fills an empty box and keeps words the student already wrote', () => {
    expect(applyCopiedSentence('', 'If the spot has starch, iodine turns it blue-black.')).toBe(
      'If the spot has starch, iodine turns it blue-black.',
    );
    expect(applyCopiedSentence('  ', 'Light is needed to make starch.')).toBe('Light is needed to make starch.');
    expect(applyCopiedSentence('Maybe.', 'Light is needed to make starch.')).toBe('Maybe. Light is needed to make starch.');
    expect(applyCopiedSentence('Light is needed to make starch.', 'Light is needed to make starch.')).toBe(
      'Light is needed to make starch.',
    );
  });
});