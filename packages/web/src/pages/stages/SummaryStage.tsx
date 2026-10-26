import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PLAN_STAGES, STAGE_TITLES, apparatusName, themeTitle, type PlanStage } from '@labguide/shared';
import { api } from '../../api';
import { errorMessage, useSession } from '../../session';
import { ErrorState, Icon, SafetyBlocks } from '../../components/ui';

function Section({ stage, children }: { stage: PlanStage; children: ReactNode }) {
  const { session, validation } = useSession();
  const ok = validation.stages[stage].complete;
  return (
    <div className="answer-card" style={{ borderLeftColor: ok ? 'var(--teal)' : 'var(--amber-line)' }}>
      <div className="card-title">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          {STAGE_TITLES[stage]} <span className="pill">{ok ? 'Complete' : 'Needs work'}</span>
        </h2>
        <Link className="btn btn-small" to={`/s/${session.id}/${stage}`} aria-label={`Edit ${STAGE_TITLES[stage]}`}>
          <Icon name="pencil" /> Edit
        </Link>
      </div>
      {children}
    </div>
  );
}

export function PlanSummaryContent() {
  const { plan, checklist } = useSession();
  const empty = <span className="muted">(not written yet)</span>;
  return (
    <div className="stack">
      <Section stage="theme"><p>{plan.theme.theme ? themeTitle(plan.theme.theme, plan.theme.customTitle) : empty}</p></Section>
      <Section stage="hypothesis"><p>{plan.hypothesis.trim() || empty}</p></Section>
      <Section stage="variables">
        <dl className="summary-list" style={{ margin: 0 }}>
          <dt>Independent (change)</dt><dd>{plan.variables.independent || empty}</dd>
          <dt>Dependent (measure)</dt><dd>{plan.variables.dependent || empty}</dd>
          <dt>Controlled (keep the same)</dt>
          <dd>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {plan.variables.controlled.filter((c) => c.text.trim()).map((c) => <li key={c.id}>{c.text}</li>)}
            </ul>
          </dd>
        </dl>
      </Section>
      <Section stage="apparatus">
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {plan.apparatus.selected.map((id) => (
            <li key={id}>
              {apparatusName(id)}
              {plan.apparatus.justifications[id]?.trim() && <span className="muted"> — {plan.apparatus.justifications[id]}</span>}
            </li>
          ))}
        </ul>
        {plan.apparatus.selected.length === 0 && empty}
      </Section>
      <Section stage="procedure">
        <ol style={{ margin: 0, paddingLeft: '1.3rem' }}>
          {plan.procedure.filter((s) => s.text.trim()).map((s) => <li key={s.id}>{s.text}</li>)}
        </ol>
      </Section>
      <Section stage="safety">
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {checklist.map((c) => (
            <li key={c.id}>{plan.safety.checklist[c.id] ? '✓' : '○'} {c.text}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function SummaryStage() {
  const { session, validation, flush } = useSession();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const incomplete = PLAN_STAGES.filter((s) => s !== 'summary' && !validation.stages[s].complete);

  async function generate() {
    setErr(null);
    await flush();
    try {
      const res = await api.review(session.id);
      if (!res.validation.canGenerateDiagram) {
        setErr('The server found something to fix. Check the stages marked “Needs work”.');
        return;
      }
      await api.setProgress(session.id, 'diagram');
      nav(`/s/${session.id}/diagram`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">7. Plan summary</h1>
      <p>Read your whole plan. Use “Edit” to change any part.</p>
      <SafetyBlocks issues={validation.safetyBlocks} />
      <PlanSummaryContent />
      <div className="card stack">
        <button className="btn btn-primary" onClick={generate} disabled={!validation.canGenerateDiagram} aria-describedby="gen-why">
          <Icon name="pencil" /> Generate Sectional Diagram
        </button>
        <p id="gen-why" className="hint-text" style={{ margin: 0 }} aria-live="polite">
          {validation.canGenerateDiagram
            ? 'Your plan passed every check. You can now build your diagram.'
            : validation.safetyBlocks.length
              ? 'Locked: fix the safety problem first.'
              : `Locked: finish ${incomplete.map((s) => STAGE_TITLES[s]).join(', ')} first.`}
        </p>
        {err && <ErrorState message={err} onRetry={generate} />}
      </div>
      <div className="stage-footer">
        <Link className="btn" to={`/s/${session.id}/safety`}><Icon name="arrowLeft" /> Back</Link>
      </div>
    </section>
  );
}
