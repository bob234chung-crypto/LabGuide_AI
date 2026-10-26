import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type SaveStatus = 'idle' | 'saved' | 'saving' | 'error';

interface Ctx {
  status: SaveStatus;
  setStatus: (s: SaveStatus) => void;
  retry: (() => void) | null;
  setRetry: (fn: (() => void) | null) => void;
}

const SaveCtx = createContext<Ctx>({ status: 'idle', setStatus: () => {}, retry: null, setRetry: () => {} });

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [retry, setRetryState] = useState<(() => void) | null>(null);
  const setRetry = useCallback((fn: (() => void) | null) => setRetryState(() => fn), []);
  const value = useMemo(() => ({ status, setStatus, retry, setRetry }), [status, retry, setRetry]);
  return <SaveCtx.Provider value={value}>{children}</SaveCtx.Provider>;
}

export const useSaveStatus = () => useContext(SaveCtx);

export function SaveIndicator() {
  const { status, retry } = useSaveStatus();
  if (status === 'idle') return null;
  return (
    <span className="save-indicator" data-state={status} role="status" aria-live="polite">
      {status === 'saving' && 'Saving…'}
      {status === 'saved' && '✓ Saved'}
      {status === 'error' && (
        <>
          Not saved yet
          {retry && (
            <button className="btn btn-small" onClick={retry}>
              Retry
            </button>
          )}
        </>
      )}
    </span>
  );
}
