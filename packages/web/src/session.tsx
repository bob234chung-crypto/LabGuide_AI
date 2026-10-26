import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  safetyChecklist,
  validatePlan,
  type AppStage,
  type ChatMessage,
  type ChecklistItem,
  type Plan,
  type PlanStage,
  type PlanValidation,
  type ReviewedStage,
  type Session,
  type StageReview,
} from '@labguide/shared';
import { api, ApiError } from './api';
import { useRequestGate } from './hooks';
import { refreshProviderStatus } from './providerStatus';
import { useSaveStatus } from './saveStatus';

export type SaveState = 'saved' | 'saving' | 'error';

interface SessionCtx {
  session: Session;
  plan: Plan;
  /** Same deterministic rules as the server, for instant feedback. The server re-checks every move. */
  validation: PlanValidation;
  checklist: ChecklistItem[];
  saveState: SaveState;
  update: <S extends PlanStage>(stage: S, value: StageValue<S>) => void;
  flush: () => Promise<void>;
  retrySave: () => void;
  setChat: (fn: (chat: ChatMessage[]) => ChatMessage[]) => void;
  replaceSession: (s: Session) => void;
  /** Takes the server's reviews, chat and stage without touching local (possibly unsaved) answers. */
  applyServer: (s: Session) => void;
}

type StageValue<S extends PlanStage> = S extends 'theme'
  ? Plan['theme']
  : S extends 'hypothesis'
    ? string
    : S extends 'variables'
      ? Plan['variables']
      : S extends 'apparatus'
        ? Plan['apparatus']
        : S extends 'procedure'
          ? Plan['procedure']
          : S extends 'safety'
            ? Plan['safety']
            : never;

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside provider');
  return c;
}

const DEBOUNCE_MS = 700;

export function SessionProvider({ initial, children }: { initial: Session; children: ReactNode }) {
  const [session, setSession] = useState<Session>(initial);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const pending = useRef<Map<PlanStage, unknown>>(new Map());
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const sessionId = session.id;

  const doFlush = useCallback(
    async (keepalive = false) => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (inflight.current) await inflight.current;
      if (!pending.current.size) return;
      const batch = [...pending.current.entries()];
      pending.current.clear();
      setSaveState('saving');
      const run = (async () => {
        try {
          for (const [stage, value] of batch) {
            const res = await api.saveStage(sessionId, stage, value, keepalive);
            setSession((prev) => ({
              ...prev,
              title: res.session.title,
              updatedAt: res.session.updatedAt,
            }));
          }
          setSaveState(pending.current.size ? 'saving' : 'saved');
        } catch {
          for (const [stage, value] of batch) if (!pending.current.has(stage)) pending.current.set(stage, value);
          setSaveState('error');
        }
      })();
      inflight.current = run;
      await run;
      inflight.current = null;
    },
    [sessionId],
  );

  const update = useCallback(
    <S extends PlanStage>(stage: S, value: StageValue<S>) => {
      setSession((prev) => ({ ...prev, plan: { ...prev.plan, [stage]: value } }));
      pending.current.set(stage, value);
      setSaveState('saving');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void doFlush(), DEBOUNCE_MS);
    },
    [doFlush],
  );

  const { setStatus, setRetry } = useSaveStatus();
  useEffect(() => {
    setStatus(saveState);
    setRetry(saveState === 'error' ? () => void doFlush() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState]);
  useEffect(() => () => setStatus('idle'), [setStatus]);

  useEffect(() => {
    const onHide = () => void doFlush(true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void doFlush(true);
    };
  }, [doFlush]);

  const value = useMemo<SessionCtx>(
    () => ({
      session,
      plan: session.plan,
      validation: validatePlan(session.plan),
      checklist: safetyChecklist(session.plan),
      saveState,
      update,
      flush: () => doFlush(),
      retrySave: () => void doFlush(),
      setChat: (fn) => setSession((prev) => ({ ...prev, chat: fn(prev.chat) })),
      replaceSession: (s) => setSession(s),
      applyServer: (s) =>
        setSession((prev) => ({
          ...prev,
          stageReviews: s.stageReviews,
          chat: s.chat,
          currentStage: s.currentStage,
          updatedAt: s.updatedAt,
          failedChecks: s.failedChecks,
          shownExamples: s.shownExamples,
        })),
    }),
    [session, saveState, update, doFlush],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type AdvanceResult = { ok: true } | { ok: false; failedStage?: ReviewedStage };

/**
 * Moves forward through the server, which runs the deterministic rules and then the quality
 * review of the stages being passed. A failed review comes back with guiding questions,
 * which are stored on the session (and shown by the tutor).
 */
export function useAdvance() {
  const { session, flush, applyServer } = useSession();
  const gate = useRequestGate();
  const [error, setError] = useState<string | null>(null);

  async function run(target: AppStage, method?: 'canvas'): Promise<AdvanceResult> {
    setError(null);
    await flush();
    try {
      const res = await api.setProgress(session.id, target, method);
      applyServer(res.session);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError && e.body.error === 'review_failed') {
        applyServer(e.body.session as Session);
        if (e.body.review && (e.body.review as StageReview).fallbackReason === 'budget') void refreshProviderStatus();
        return { ok: false, failedStage: e.body.stage as ReviewedStage };
      }
      setError(errorMessage(e));
      return { ok: false };
    }
  }

  return {
    advance: async (target: AppStage, method?: 'canvas') =>
      (await gate.tryRun('advance', () => run(target, method))) ?? { ok: false as const },
    busy: gate.busy('advance'),
    error,
    clearError: () => setError(null),
  };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.body.message ?? 'Something went wrong.';
  return 'We could not reach LabGuide. Check your connection.';
}
