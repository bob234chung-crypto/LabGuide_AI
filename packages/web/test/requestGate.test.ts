import { describe, expect, it } from 'vitest';
import { createRequestGate } from '../src/requestGate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('request gate (busy buttons stay enabled)', () => {
  it('ignores a repeat press of the same action while it is in flight, so nothing is sent twice', async () => {
    const gate = createRequestGate();
    const d = deferred();
    let sent = 0;
    const task = async () => {
      sent++;
      await d.promise;
    };
    const first = gate.tryRun('submit', task);
    const second = gate.tryRun('submit', task);
    expect(sent).toBe(1);
    expect(gate.busy('submit')).toBe(true);
    expect(await second).toBeUndefined();
    d.resolve();
    await first;
    expect(gate.busy('submit')).toBe(false);
    await gate.tryRun('submit', task);
    expect(sent).toBe(2);
  });

  it('runs a different action pressed while another is in flight', async () => {
    const gate = createRequestGate();
    const d = deferred();
    const save = gate.tryRun('save', () => d.promise);
    expect(await gate.tryRun('submit', async () => 'submitted')).toBe('submitted');
    expect(gate.busy('save')).toBe(true);
    expect(gate.busy('submit')).toBe(false);
    d.resolve();
    await save;
  });

  it('does not drop a press made while an automatic request (the tutor greeting) is loading', async () => {
    const gate = createRequestGate();
    const d = deferred();
    const greeting = gate.track(() => d.promise);
    expect(gate.busy()).toBe(true);
    expect(gate.busy('hint')).toBe(false);
    expect(await gate.tryRun('hint', async () => 'hint')).toBe('hint');
    d.resolve();
    await greeting;
    expect(gate.busy()).toBe(false);
  });

  it('clears busy after a failure and notifies on every change', async () => {
    let changes = 0;
    const gate = createRequestGate(() => changes++);
    await expect(gate.tryRun('check', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(gate.busy()).toBe(false);
    expect(changes).toBe(2);
  });
});
