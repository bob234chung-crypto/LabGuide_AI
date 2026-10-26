import { useEffect, useState } from 'react';
import type { ProviderStatus } from '@labguide/shared';
import { api } from './api';

let current: ProviderStatus | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** Re-reads which tutor the server uses (for example after the daily AI limit is reached). */
export function refreshProviderStatus(): Promise<void> {
  inflight ??= api
    .providerStatus()
    .then((s) => {
      current = s;
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
      notify();
    });
  return inflight;
}

export function setProviderStatus(s: ProviderStatus) {
  current = s;
  notify();
}

/** The server's provider status, shared by the top bar and the tutor panel. Null while loading. */
export function useProviderStatus(): ProviderStatus | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!current) void refreshProviderStatus();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return current;
}

/** True when tutor replies come from the real AI right now. */
export function usesRealAi(s: ProviderStatus | null): boolean {
  return !!s && s.activeProvider === 'deepseek' && !s.demoMode;
}
