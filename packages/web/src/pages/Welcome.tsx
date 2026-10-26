import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STAGE_TITLES, type SessionSummary } from '@labguide/shared';
import { api } from '../api';
import { DemoBadge, ErrorState, Icon } from '../components/ui';
import { errorMessage } from '../session';

function stageLabel(stage: SessionSummary['currentStage']): string {
  return stage === 'diagram' ? 'Diagram' : STAGE_TITLES[stage];
}

function stagePath(s: SessionSummary): string {
  return s.currentStage === 'diagram' ? `/s/${s.id}/diagram` : `/s/${s.id}/${s.currentStage}`;
}

export function Welcome() {
  const nav = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      setSessions(await api.listSessions());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function start() {
    setBusy(true);
    try {
      const { session } = await api.createSession();
      nav(`/s/${session.id}/theme`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove(s: SessionSummary) {
    if (!window.confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteSession(s.id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <main id="main" className="page">
      <section className="hero">
        <div>
          <p className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>For S1–S3 science students</p>
          <h1>Plan a fair science investigation, step by step.</h1>
          <p>
            LabGuide asks you questions to help you think. You write every answer yourself. Then you build a
            labelled side-view diagram of your setup.
          </p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={start} disabled={busy}>
              <Icon name="plus" /> Start a new investigation
            </button>
            {sessions && sessions.length > 0 && (
              <a className="btn" href="#saved">Resume a saved one</a>
            )}
          </div>
        </div>
        <div className="card">
          <h2>How it works</h2>
          <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Choose a theme and write a hypothesis.</li>
            <li>Name your variables and choose apparatus.</li>
            <li>Write your method and check it is safe.</li>
            <li>Build and label your diagram on the canvas.</li>
          </ol>
          <p className="notice" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <DemoBadge /> This preview uses a simulated tutor. No real AI provider is connected.
          </p>
        </div>
      </section>

      <section id="saved" className="card" aria-labelledby="saved-h" tabIndex={-1}>
        <h2 id="saved-h">Your saved investigations</h2>
        {error && <ErrorState message={error} onRetry={load} />}
        {!sessions && !error && <p className="muted">Loading…</p>}
        {sessions && sessions.length === 0 && <p className="muted">No saved investigations yet. Start a new one above.</p>}
        {sessions && sessions.length > 0 && (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id} className="card" style={{ boxShadow: 'none' }}>
                <div>
                  <strong>{s.title}</strong>
                  <div className="muted" style={{ fontSize: '0.92rem' }}>
                    Stage: {stageLabel(s.currentStage)} · Last saved {new Date(s.updatedAt).toLocaleString('en-GB')}
                    {s.diagramVersions > 0 && ` · ${s.diagramVersions} diagram version${s.diagramVersions > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="btn-row">
                  <Link className="btn btn-primary btn-small" to={stagePath(s)} aria-label={`Resume ${s.title}`}>
                    Resume <Icon name="arrowRight" />
                  </Link>
                  <button className="btn btn-small" onClick={() => remove(s)} aria-label={`Delete ${s.title}`}>
                    <Icon name="trash" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        Experiments are done only in the school laboratory, with your teacher, following school lab rules.
        Your work is kept for 30 days after you last use it. See <Link to="/settings">Settings</Link>.
      </p>
    </main>
  );
}
