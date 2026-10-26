/**
 * Tracks in-flight requests so a button can stay enabled (and keep focus) while busy.
 * `tryRun` is for user actions: a repeat press while anything is in flight is ignored, not
 * queued. `track` always runs, for automatic requests that must not be dropped.
 */
export interface RequestGate {
  readonly busy: boolean;
  track<T>(task: () => Promise<T>): Promise<T>;
  tryRun<T>(task: () => Promise<T>): Promise<T | undefined>;
}

export function createRequestGate(onBusyChange: (busy: boolean) => void = () => undefined): RequestGate {
  let inflight = 0;
  const gate: RequestGate = {
    get busy() {
      return inflight > 0;
    },
    async track(task) {
      if (inflight++ === 0) onBusyChange(true);
      try {
        return await task();
      } finally {
        if (--inflight === 0) onBusyChange(false);
      }
    },
    async tryRun(task) {
      if (inflight > 0) return undefined;
      return gate.track(task);
    },
  };
  return gate;
}
