import { useCallback, useRef, useState } from 'react';

/** Undo/redo stack. `preview` changes the present without a history entry (used while dragging). */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const base = useRef<T | null>(null);

  const commit = useCallback((next: T) => {
    setState((s) => {
      const from = base.current ?? s.present;
      base.current = null;
      if (Object.is(from, next)) return s;
      return { past: [...s.past, from].slice(-100), present: next, future: [] };
    });
  }, []);

  const preview = useCallback((next: T) => {
    setState((s) => {
      if (base.current === null) base.current = s.present;
      return { ...s, present: next };
    });
  }, []);

  const cancelPreview = useCallback(() => {
    setState((s) => {
      const b = base.current;
      base.current = null;
      return b === null ? s : { ...s, present: b };
    });
  }, []);

  const reset = useCallback((value: T) => {
    base.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    preview,
    cancelPreview,
    reset,
    undo,
    redo,
  };
}
