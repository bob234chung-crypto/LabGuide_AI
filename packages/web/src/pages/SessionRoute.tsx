import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  PLAN_STAGES,
  STAGE_TITLES,
  canOpenDiagram,
  gatedFurthest,
  isAppStageUnlocked,
  isGatedStageUnlocked,
  isReviewedStage,
  reviewPassed,
  stageAnswerKey,
  stageDone,
  type AppStage,
  type PlanStage,
  type Session,
} from '@labguide/shared';
import { api } from '../api';
import { ExampleHelp } from '../components/ExampleHelp';
import { ErrorState, Icon } from '../components/ui';
import { TutorPanel } from '../components/TutorPanel';
import { SessionProvider, errorMessage, useAdvance, useSession } from '../session';
import { useIsDesktop } from '../hooks';
import { ThemeStage } from './stages/ThemeStage';
import { HypothesisStage } from './stages/HypothesisStage';
import { VariablesStage } from './stages/VariablesStage';
import { ApparatusStage } from './stages/ApparatusStage';
import { ProcedureStage } from './stages/ProcedureStage';
import { SafetyStage } from './stages/SafetyStage';
import { SummaryStage } from './stages/SummaryStage';
import { DiagramMethodChoice, PhotoUploadComingSoon } from './diagram/DiagramMethod';
import { CanvasEditor } from './diagram/CanvasEditor';
import { DiagramResult } from './diagram/DiagramResult';

export function SessionRoute() {
  const { id = '' } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.getSession(id);
      setSession(res.session);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    setSession(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error)
    return (
      <main id="main" className="page">
        <ErrorState message={error} onRetry={load} />
        <p><Link to="/">Back to the welcome page</Link></p>
      </main>
    );
  if (!session) return <main id="main" className="page"><p className="muted">Loading your work…</p></main>;
  return (
    <SessionProvider key={session.id} initial={session}>
      <SessionLayout />
    </SessionProvider>
  );
}

const STAGE_COMPONENTS: Record<PlanStage, () => JSX.Element> = {
  theme: ThemeStage,
  hypothesis: HypothesisStage,
  variables: VariablesStage,
  apparatus: ApparatusStage,
  procedure: ProcedureStage,
  safety: SafetyStage,
  summary: SummaryStage,
};

function currentStageFromPath(path: string): { stage: AppStage; canvas: boolean } {
  const parts = path.split('/').filter(Boolean);
  const seg = parts[2] ?? 'theme';
  if (seg === 'diagram') return { stage: 'diagram', canvas: parts[3] === 'canvas' };
  return { stage: (PLAN_STAGES as readonly string[]).includes(seg) ? (seg as PlanStage) : 'theme', canvas: false };
}

export function ProgressBar({ stage }: { stage: AppStage }) {
  const { validation, plan, session } = useSession();
  const idx = stage === 'diagram' ? PLAN_STAGES.length : PLAN_STAGES.indexOf(stage);
  const isDone = (s: PlanStage) => stageDone(validation, plan, session.stageReviews, s);
  const done = PLAN_STAGES.filter(isDone).length;
  return (
    <nav className="progress" aria-label="Progress">
      <ol>
        {PLAN_STAGES.map((s, i) => (
          <li key={s} data-state={i === idx ? 'current' : isDone(s) ? 'done' : 'todo'} title={STAGE_TITLES[s]}>
            <span className="sr-only">
              {STAGE_TITLES[s]}: {i === idx ? 'current stage' : isDone(s) ? 'complete' : 'not complete'}
            </span>
          </li>
        ))}
      </ol>
      <div className="progress-label">
        {stage === 'diagram' ? 'Diagram' : `Stage ${idx + 1} of 7: ${STAGE_TITLES[stage]}`} · {done} of 7 stages complete
      </div>
    </nav>
  );
}

function StageNav({ stage }: { stage: AppStage }) {
  const { session, validation, plan } = useSession();
  const reviews = session.stageReviews;
  const items: { key: AppStage; title: string; unlocked: boolean; done: boolean }[] = [
    ...PLAN_STAGES.map((s) => ({
      key: s as AppStage,
      title: STAGE_TITLES[s],
      unlocked: isGatedStageUnlocked(validation, plan, reviews, s),
      done: stageDone(validation, plan, reviews, s),
    })),
    { key: 'diagram', title: 'Diagram', unlocked: canOpenDiagram(validation, plan, reviews), done: false },
  ];
  return (
    <nav className="stage-nav card" aria-label="Stages">
      <ol>
        {items.map((it, i) => (
          <li key={it.key}>
            {it.unlocked ? (
              <Link to={`/s/${session.id}/${it.key}`} aria-current={it.key === stage ? 'step' : undefined}>
                <span className="step-dot" data-done={it.done}>{it.done ? <Icon name="check" size={14} /> : i + 1}</span>
                {it.title}
                {it.done && <span className="sr-only"> (complete)</span>}
              </Link>
            ) : (
              <span className="locked" aria-disabled="true">
                <span className="step-dot"><Icon name="lock" size={13} /></span>
                {it.title}
                <span className="sr-only"> (locked: finish and check the earlier stages first)</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function MobileStageSelect({ stage }: { stage: AppStage }) {
  const { session, validation, plan } = useSession();
  const reviews = session.stageReviews;
  const open = (s: AppStage) => isGatedStageUnlocked(validation, plan, reviews, s);
  const nav = useNavigate();
  return (
    <div className="mobile-stage-select">
      <label htmlFor="stage-jump" className="sr-only">Go to stage</label>
      <select id="stage-jump" value={stage} onChange={(e) => nav(`/s/${session.id}/${e.target.value}`)}>
        {PLAN_STAGES.map((s, i) => (
          <option key={s} value={s} disabled={!open(s)}>
            {i + 1}. {STAGE_TITLES[s]} {stageDone(validation, plan, reviews, s) ? '✓' : open(s) ? '' : '(locked)'}
          </option>
        ))}
        <option value="diagram" disabled={!open('diagram')}>8. Diagram {open('diagram') ? '' : '(locked)'}</option>
      </select>
    </div>
  );
}

function SessionLayout() {
  const { session, validation, flush, plan } = useSession();
  const loc = useLocation();
  const desktop = useIsDesktop();
  const [drawer, setDrawer] = useState(false);
  const { stage, canvas } = currentStageFromPath(loc.pathname);
  const locked = !isGatedStageUnlocked(validation, plan, session.stageReviews, stage);

  useEffect(() => {
    // The server answers 409 for a locked stage, so only record progress the plan allows,
    // and only after pending edits are saved so the server judges the same plan.
    const record = !locked && session.currentStage !== stage;
    void flush().then(() => {
      if (record) api.setProgress(session.id, stage).catch(() => undefined);
    });
    setDrawer(false);
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, canvas]);

  return (
    <div className={`layout ${canvas ? 'layout--canvas' : ''}`}>
      {!canvas && <StageNav stage={stage} />}
      <main id="main" tabIndex={-1} className={canvas ? 'canvas-page' : ''}>
        {!canvas && <MobileStageSelect stage={stage} />}
        <ProgressBar stage={stage} />
        {locked ? (
          <LockedStage stage={stage} />
        ) : (
          <Routes>
            {PLAN_STAGES.map((s) => {
              const C = STAGE_COMPONENTS[s];
              return <Route key={s} path={s} element={<C />} />;
            })}
            <Route path="diagram" element={<DiagramMethodChoice />} />
            <Route path="diagram/canvas" element={<CanvasEditor />} />
            <Route path="diagram/photo" element={<PhotoUploadComingSoon />} />
            <Route path="diagram/result" element={<DiagramResult />} />
            <Route path="*" element={<Navigate to={`/s/${session.id}/${session.currentStage}`} replace />} />
          </Routes>
        )}
      </main>
      {desktop ? (
        <aside className="tutor-desktop" aria-label="Tutor panel">
          <TutorPanel stage={stage} headingId="tutor-h" />
        </aside>
      ) : (
        <>
          <button className={`btn btn-primary tutor-fab ${canvas ? 'raised' : ''}`} onClick={() => setDrawer(true)} aria-haspopup="dialog">
            <Icon name="chat" /> Tutor
          </button>
          {drawer && (
            <>
              <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
              <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="tutor-m-h"
                onKeyDown={(e) => e.key === 'Escape' && setDrawer(false)}>
                <TutorPanel stage={stage} onClose={() => setDrawer(false)} headingId="tutor-m-h" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Shown for a stage the student may not open yet. */
function LockedStage({ stage }: { stage: AppStage }) {
  const { session, validation, plan } = useSession();
  const nav = useNavigate();
  const { advance, busy, error } = useAdvance();
  const furthest = gatedFurthest(validation, plan, session.stageReviews);
  // The rules already allow this stage; only a quality check (for example of answers saved
  // before checks existed, or edited since) is missing.
  const needsCheckOnly = isAppStageUnlocked(validation, stage);

  async function check() {
    const r = await advance(stage);
    if (!r.ok && r.failedStage) nav(`/s/${session.id}/${r.failedStage}`);
  }

  return (
    <div className="card stack">
      <h1>This stage is locked</h1>
      <p>
        {needsCheckOnly
          ? 'The tutor needs to check your earlier answers before you continue. Your work is saved.'
          : stage === 'diagram'
            ? 'Finish every stage and fix any safety problems to unlock the diagram.'
            : 'Finish the earlier stages first. You can always go back to edit.'}
      </p>
      <div className="btn-row">
        {needsCheckOnly && (
          <button className="btn btn-primary" aria-busy={busy} onClick={() => void check()}>
            <Icon name="check" /> {busy ? 'Checking your answers…' : 'Check my answers and continue'}
          </button>
        )}
        <Link className={`btn ${needsCheckOnly ? '' : 'btn-primary'}`} to={`/s/${session.id}/${furthest}`}>
          Go to {STAGE_TITLES[furthest]}
        </Link>
      </div>
      {error && <ErrorState message={error} onRetry={() => void check()} />}
    </div>
  );
}

export function StageFooter({ stage }: { stage: PlanStage }) {
  const { session, validation, plan } = useSession();
  const nav = useNavigate();
  const { advance, busy, error } = useAdvance();
  const idx = PLAN_STAGES.indexOf(stage);
  const prev = PLAN_STAGES[idx - 1];
  const next = PLAN_STAGES[idx + 1];
  const sv = validation.stages[stage];
  const blocked = sv.issues.some((i) => i.severity === 'safety_block');
  const reviewedStage = isReviewedStage(stage) && stage !== 'summary' ? stage : null;
  const saved = reviewedStage ? session.stageReviews?.[reviewedStage] : undefined;
  const review = reviewedStage && saved && saved.answerKey === stageAnswerKey(plan, reviewedStage) ? saved : undefined;
  const passed = !reviewedStage || reviewPassed(plan, session.stageReviews, reviewedStage);
  // A failed check for these exact answers keeps Next off. Editing a card changes the
  // answer key, so Next comes back and the student can ask for another check.
  const held = Boolean(review && !review.passed);
  const nextEnabled = sv.complete && !held;

  async function goNext() {
    if (!next || !nextEnabled) return;
    const r = await advance(next);
    if (r.ok) nav(`/s/${session.id}/${next}`);
  }
  const firstRequired = sv.issues.find((i) => i.required);
  return (
    <div className="stack">
      {reviewedStage && <ExampleHelp stage={reviewedStage} />}
      <div className="stage-footer">
        {prev ? (
          <Link className="btn" to={`/s/${session.id}/${prev}`}>
            <Icon name="arrowLeft" /> Back
          </Link>
        ) : (
          <Link className="btn" to="/">
            <Icon name="arrowLeft" /> Welcome
          </Link>
        )}
        {next && (
          <button className={nextEnabled ? 'btn btn-primary' : 'btn'} type="button" onClick={() => void goNext()}
            disabled={!nextEnabled} aria-busy={busy} aria-describedby={`why-${stage}`}>
            {busy ? 'Checking your answer…' : <>Next: {STAGE_TITLES[next]} <Icon name="arrowRight" /></>}
          </button>
        )}
        <p id={`why-${stage}`} className="why" aria-live="polite">
          {!sv.complete
            ? blocked
              ? 'Fix the safety problem above to continue.'
              : firstRequired
                ? `To continue: ${firstRequired.message}`
                : ''
            : passed
              ? 'This stage is complete. You can come back and edit it at any time.'
              : review && !review.passed
                ? 'Next stays off until every card says OK. Change the card, then press Next again.'
                : 'Press Next. Each card is checked before you move on.'}
        </p>
        {error && <div style={{ flexBasis: '100%' }}><ErrorState message={error} onRetry={() => void goNext()} /></div>}
      </div>
    </div>
  );
}
