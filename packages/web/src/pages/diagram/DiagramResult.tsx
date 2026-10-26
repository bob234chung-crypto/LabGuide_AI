import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasSafetyBlock, themeTitle, type Diagram } from '@labguide/shared';
import { api } from '../../api';
import { errorMessage, useSession } from '../../session';
import { CheckList, ErrorState, Icon, SafetyBlock } from '../../components/ui';
import { CleanDiagram } from '../../canvas/render';
import { exportPdf, exportPng } from '../../canvas/export';
import { PlanSummaryContent } from '../stages/SummaryStage';
import { useRequestGate } from '../../hooks';

export function DiagramResult() {
  const { session, plan } = useSession();
  const nav = useNavigate();
  const [working, setWorking] = useState<Diagram | null>(null);
  const [versions, setVersions] = useState<Diagram[]>([]);
  const [viewing, setViewing] = useState<Diagram | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const gate = useRequestGate();
  const svgRef = useRef<SVGSVGElement>(null);
  const title = themeTitle(plan.theme.theme, plan.theme.customTitle);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.diagrams(session.id);
      setWorking(res.working);
      setVersions(res.versions);
      if (res.working) {
        const c = await api.checkDiagram(res.working.id);
        setWorking({ ...res.working, checks: c.checks });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [session.id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!working) {
    return (
      <div className="card stack">
        <h1>No diagram yet</h1>
        <Link className="btn btn-primary" to={`/s/${session.id}/diagram/canvas`}>Build on canvas</Link>
      </div>
    );
  }

  const shown = viewing ?? working;
  const blocked = hasSafetyBlock(working.checks);

  function run(action: string, label: string, fn: () => Promise<void>) {
    void gate.tryRun(action, async () => {
      setMsg(null);
      try {
        await fn();
        setMsg(label);
      } catch (e) {
        setMsg(errorMessage(e));
      }
    });
  }

  return (
    <section className="stack" aria-labelledby="stage-h">
      <div className="stage-head">
        <h1 id="stage-h">Your labelled diagram</h1>
        <span className="pill">{working.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
      </div>
      {viewing && (
        <div className="notice">
          You are viewing version {viewing.version} from {new Date(viewing.createdAt).toLocaleString('en-GB')}.{' '}
          <button className="btn btn-small" onClick={() => setViewing(null)}>Back to current diagram</button>
        </div>
      )}
      <div className="card">
        <CleanDiagram scene={shown.scene} title={title} svgRef={svgRef} />
      </div>

      {!viewing && blocked && (
        <SafetyBlock
          message="Your diagram has a safety problem. You cannot submit it yet."
          alternative="Open the canvas, read the red message in Diagram checks, and change your setup."
          action={<Link className="btn btn-small" to={`/s/${session.id}/diagram/canvas`}><Icon name="pencil" /> Fix on canvas</Link>}
        />
      )}

      <div className="btn-row">
        <Link className="btn" to={`/s/${session.id}/diagram/canvas`}><Icon name="pencil" /> Revise on canvas</Link>
        <button className="btn" aria-busy={gate.busy('png')} onClick={() => run('png', 'PNG downloaded.', () => exportPng(svgRef.current!, plan, title))}>
          <Icon name="download" /> Export PNG
        </button>
        <button className="btn" aria-busy={gate.busy('pdf')} onClick={() => run('pdf', 'PDF downloaded.', () => exportPdf(svgRef.current!, plan, title))}>
          <Icon name="download" /> Export PDF
        </button>
        {!viewing && (
          <>
            <button className="btn" aria-busy={gate.busy('save')} onClick={() => run('save', 'Version saved.', async () => {
              await api.saveVersion(session.id, working.scene, `${session.id}-${Date.now()}`);
              await load();
            })}>
              <Icon name="history" /> Save version
            </button>
            <button className="btn btn-primary" aria-busy={gate.busy('submit')} disabled={blocked || working.status === 'submitted'} aria-describedby="submit-why"
              onClick={() => run('submit', 'Diagram submitted. Well done!', async () => {
                const d = await api.submitDiagram(working.id);
                setWorking(d);
              })}>
              <Icon name="check" /> {working.status === 'submitted' ? 'Submitted' : 'Submit diagram'}
            </button>
          </>
        )}
      </div>
      <p id="submit-why" className="hint-text" style={{ margin: 0 }}>
        {blocked ? 'Submit is locked until the safety problem is fixed.' : 'Submitting marks this diagram as finished. You can still revise it later.'}
      </p>
      {msg && <p role="status">{msg}</p>}

      <div className="card">
        <h2>Diagram checks</h2>
        <CheckList checks={working.checks} />
      </div>

      <div className="card">
        <h2>Version history</h2>
        {versions.length === 0 ? (
          <p className="muted">No saved versions yet. Use “Save version” to keep a copy.</p>
        ) : (
          <ul className="versions">
            {versions.slice().reverse().map((v) => (
              <li key={v.id}>
                <span>
                  <strong>Version {v.version}</strong> · {new Date(v.createdAt).toLocaleString('en-GB')} · {v.scene.items.length} items
                  {hasSafetyBlock(v.checks) && ' · has a safety stop'}
                </span>
                <span className="btn-row">
                  <button className="btn btn-small" onClick={() => setViewing(v)} aria-label={`View version ${v.version}`}>View</button>
                  <button className="btn btn-small" aria-label={`Restore version ${v.version}`} aria-busy={gate.busy(`restore-${v.id}`)} onClick={() => run(`restore-${v.id}`, `Version ${v.version} restored.`, async () => {
                    const d = await api.saveWorking(session.id, v.scene);
                    setWorking(d);
                    setViewing(null);
                    nav(`/s/${session.id}/diagram/canvas`);
                  })}>Restore</button>
                  <button className="btn btn-small" aria-label={`Delete version ${v.version}`} aria-busy={gate.busy(`delete-${v.id}`)} onClick={() => run(`delete-${v.id}`, 'Version deleted.', async () => {
                    await api.deleteDiagram(v.id);
                    await load();
                  })}><Icon name="trash" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2>Plan summary</h2>
        <PlanSummaryContent />
      </div>
    </section>
  );
}
