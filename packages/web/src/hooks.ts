import { useEffect, useState } from 'react';
import { createRequestGate, type RequestGate } from './requestGate';

/** A request gate that re-renders on change. Show `gate.busy(action)` with aria-busy, not `disabled`. */
export function useRequestGate(): RequestGate {
  const [, rerender] = useState(0);
  const [gate] = useState(() => createRequestGate(() => rerender((n) => n + 1)));
  return gate;
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
