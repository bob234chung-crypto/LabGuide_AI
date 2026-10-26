import { useEffect, useState } from 'react';
import { createRequestGate, type RequestGate } from './requestGate';

/** A request gate plus a `busy` flag for rendering (use it for aria-busy, not `disabled`). */
export function useRequestGate(): { gate: RequestGate; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const [gate] = useState(() => createRequestGate(setBusy));
  return { gate, busy };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
