/**
 * Tracks in-flight requests so a button can stay enabled (and keep focus) while busy.
 * `tryRun` is for user actions: a repeat press while another user action is in flight is
 * ignored, not queued. `track` is for automatic requests (such as the tutor greeting): they
 * count as busy but never cause a user's press to be dropped.
 */
export interface RequestGate {
  readonly busy: boolean;
  track<T>(task: () => Promise<T>): Promise<T>;
  tryRun<T>(task: () => Promise<T>): Promise<T | undefined>;
}

export function createRequestGate(onBusyChange: (busy: boolean) => void = () => undefined): RequestGate {
  let inflight = 0;
  let userInflight = false;
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
      if (userInflight) return undefined;
      userInflight = true;
      try {
        return await gate.track(task);
      } finally {
        userInflight = false;
      }
    },
  };
  return gate;
}
