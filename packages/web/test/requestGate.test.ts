import { describe, expect, it } from 'vitest';
import { createRequestGate } from '../src/requestGate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('request gate (busy buttons stay enabled)', () => {
  it('ignores repeat presses while a request is in flight, so nothing is sent twice', async () => {
    const gate = createRequestGate();
    const d = deferred();
    let sent = 0;
    const task = async () => {
      sent++;
      await d.promise;
    };
    const first = gate.tryRun(task);
    const second = gate.tryRun(task);
    expect(sent).toBe(1);
    expect(await second).toBeUndefined();
    d.resolve();
    await first;
    await gate.tryRun(task);
    expect(sent).toBe(2);
  });

  it('reports busy only while something is in flight, and clears after a failure', async () => {
    const changes: boolean[] = [];
    const gate = createRequestGate((b) => changes.push(b));
    await expect(gate.tryRun(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(gate.busy).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('does not drop a press made while an automatic request (the tutor greeting) is loading', async () => {
    const gate = createRequestGate();
    const d = deferred();
    const greeting = gate.track(() => d.promise);
    expect(gate.busy).toBe(true);
    expect(await gate.tryRun(async () => 'hint')).toBe('hint');
    expect(gate.busy).toBe(true);
    d.resolve();
    await greeting;
    expect(gate.busy).toBe(false);
  });

  it('automatic requests still run while a user action is in flight', async () => {
    const gate = createRequestGate();
    const d = deferred();
    const check = gate.tryRun(() => d.promise);
    let greeted = false;
    await gate.track(async () => { greeted = true; });
    expect(greeted).toBe(true);
    expect(gate.busy).toBe(true);
    d.resolve();
    await check;
    expect(gate.busy).toBe(false);
  });
});
