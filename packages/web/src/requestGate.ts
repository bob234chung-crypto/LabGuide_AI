/**
 * Tracks in-flight requests so buttons can stay enabled (and keep focus) while busy.
 * `tryRun(action, …)` is for user actions: pressing the same action again while it is in
 * flight is ignored, not queued, so nothing is sent twice; a different action always runs.
 * `track` is for automatic requests (such as the tutor greeting): they count as busy but
 * never block a press.
 */
export interface RequestGate {
  /** With an action: is that action in flight? Without: is anything in flight? */
  busy(action?: string): boolean;
  track<T>(task: () => Promise<T>): Promise<T>;
  tryRun<T>(action: string, task: () => Promise<T>): Promise<T | undefined>;
}

export function createRequestGate(onChange: () => void = () => undefined): RequestGate {
  let tracked = 0;
  const running = new Set<string>();
  return {
    busy(action) {
      return action === undefined ? tracked > 0 || running.size > 0 : running.has(action);
    },
    async track(task) {
      tracked++;
      onChange();
      try {
        return await task();
      } finally {
        tracked--;
        onChange();
      }
    },
    async tryRun(action, task) {
      if (running.has(action)) return undefined;
      running.add(action);
      onChange();
      try {
        return await task();
      } finally {
        running.delete(action);
        onChange();
      }
    },
  };
}
