import { describe, expect, it } from 'vitest';
import { goodCardReply, notYetReply, toInstruction } from './tone.js';

describe('tutor tone', () => {
  it('never puts Good in a failed card reply', () => {
    const reply = notYetReply('Good. You will look at pizza?');
    expect(reply.startsWith('Not yet.')).toBe(true);
    expect(reply).toMatch(/You have made a start\./);
    expect(reply).not.toMatch(/\bGood\b/);
    expect(reply).not.toMatch(/pizza/i);
    expect(notYetReply('What will you look at in your test?')).toBe(
      'Not yet. You have made a start. Say what you will look at in your test.',
    );
    expect(toInstruction('How will you measure your dependent variable? What unit will you use?')).toBe(
      'Say how you will measure your dependent variable.',
    );
  });

  it('says Good only as praise for a card that passed', () => {
    expect(goodCardReply('independent', 'the light')).toBe('Good. You will change the light.');
    expect(goodCardReply('dependent', 'the starch')).toBe('Good. You will look at the starch.');
  });
});
