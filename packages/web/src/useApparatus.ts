import { useEffect, useState } from 'react';
import type { Apparatus, ApparatusGroups, ThemeId } from '@labguide/shared';
import { api } from './api';
import { errorMessage } from './session';

const cache = new Map<string, ApparatusGroups>();

export function useApparatusLibrary(theme: ThemeId | null) {
  const key = theme ?? '';
  const [data, setData] = useState<ApparatusGroups | null>(cache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    if (cache.has(key)) {
      setData(cache.get(key)!);
      return;
    }
    setError(null);
    api
      .apparatus(theme)
      .then((d) => {
        cache.set(key, d);
        if (live) setData(d);
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [key, theme, nonce]);
  const all: Apparatus[] = data ? [...data.themeItems, ...data.common, ...(data.all ?? [])].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i) : [];
  return { data, all, error, retry: () => setNonce((n) => n + 1) };
}
