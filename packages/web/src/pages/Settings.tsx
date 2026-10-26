import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Me, ProviderStatus } from '@labguide/shared';
import { api } from '../api';
import { errorMessage } from '../session';
import { AiBadge, DemoBadge, ErrorState, Icon, Modal } from '../components/ui';
import { setProviderStatus } from '../providerStatus';

const POE_RESULT: Record<string, { text: string; ok: boolean }> = {
  demo_connected: { text: 'Simulated connection created. Demo mode – no real connection was made.', ok: true },
  consent_required: { text: 'Please read the consent notice and tick the box first.', ok: false },
  state_mismatch: { text: 'The connection check failed (security code did not match). Nothing was connected. Please try again.', ok: false },
  denied: { text: 'The connection was cancelled. Nothing was connected.', ok: false },
  not_configured: { text: 'Poe is not set up on this server. Nothing was connected.', ok: false },
  error: { text: 'Something went wrong. Nothing was connected. Your work is safe.', ok: false },
};

export function Settings() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const poeResult = POE_RESULT[params.get('poe') ?? ''];

  async function load() {
    setError(null);
    try {
      const [s, m] = await Promise.all([api.providerStatus(), api.me()]);
      setStatus(s);
      setProviderStatus(s);
      setMe(m);
      setNickname(m.nickname);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(fn: () => Promise<void>, done: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(done);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  return (
    <main id="main" className="page stack">
      <h1>Settings</h1>
      {error && <ErrorState message={error} onRetry={load} />}
      {poeResult && (
        <div className={poeResult.ok ? 'issue issue-ok' : 'notice'} role="status">
          <span>{poeResult.text}</span>
          <button className="btn btn-small" onClick={() => setParams({})}>Dismiss</button>
        </div>
      )}
      {msg && <p role="status" className="notice">{msg}</p>}

      {status && (
        <div className="settings-grid">
          <section className="card stack" aria-labelledby="prov-h">
            <h2 id="prov-h">Tutor provider</h2>
            <div className="status-row">
              <strong>Current provider:</strong>{' '}
              {status.activeProvider === 'deepseek'
                ? `DeepSeek (${status.deepseek.model ?? 'deepseek-chat'})`
                : status.activeProvider === 'demo'
                  ? 'Demo tutor (simulated)'
                  : status.activeProvider}
              {status.activeProvider === 'deepseek' && !status.demoMode ? <AiBadge /> : status.demoMode && <DemoBadge />}
            </div>
            <div className="status-row">
              <span className="status-dot" data-kind={status.deepseek.state === 'connected' ? 'ok' : status.activeProvider === 'demo' ? 'sim' : 'off'} aria-hidden="true" />
              <strong>Connection:</strong>{' '}
              {status.activeProvider === 'deepseek' ? status.deepseek.label : 'Demo mode – no real connection'}
            </div>
            {status.deepseek.budgetReached && (
              <p className="notice" style={{ margin: 0 }}>
                Today’s AI limit has been reached. The Demo tutor is used until midnight (Hong Kong time). Your work is saved.
              </p>
            )}
            {status.activeProvider === 'deepseek' && status.deepseek.state === 'configured_unreachable' && (
              <p className="notice" style={{ margin: 0 }}>
                DeepSeek is not answering right now. If the tutor fails, press Retry or Continue later. Your work is saved.
              </p>
            )}
            <p className="muted" style={{ margin: 0 }}>
              Your school or app administrator chooses the provider on the server. You cannot change it here, and
              this app never asks you for an API key.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 500 }}>
              <input type="checkbox" checked={status.simulateErrors}
                onChange={(e) => act(async () => setStatus(await api.setSimulateErrors(e.target.checked)), e.target.checked ? 'Tutor errors will be simulated.' : 'Tutor errors are off.')} />
              <span>Simulate a tutor error (to try the Retry / Continue later screen) <DemoBadge /></span>
            </label>
          </section>

          <section className="card stack" aria-labelledby="ds-h">
            <h2 id="ds-h">DeepSeek AI tutor</h2>
            <div className="status-row">
              <span className="status-dot" data-kind={status.deepseek.state === 'connected' ? 'ok' : 'off'} aria-hidden="true" />
              <strong>Status:</strong> {status.deepseek.label}
            </div>
            <p style={{ margin: 0 }}>
              The app administrator sets up DeepSeek on the LabGuide server. Students never sign in to DeepSeek or
              enter a key. When it is on, it writes the tutor’s questions and checks whether each stage is ready.
            </p>
            <h3 style={{ margin: '0.25rem 0 0', fontSize: '1rem' }}>What this means for your data</h3>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li><strong>Provider:</strong> DeepSeek, an AI company based in mainland China.</li>
              <li><strong>Where:</strong> DeepSeek’s servers are in mainland China. What is sent is processed and stored there, under the laws of mainland China.</li>
              <li><strong>What is sent:</strong> your topic, your answers for the stage you are working on (and the earlier stages it depends on), your messages to the tutor, and the last few tutor messages. LabGuide removes email addresses, phone numbers and ID numbers first.</li>
              <li><strong>What is never sent:</strong> your name, your nickname, your student ID or your school. Please do not type your name or other personal details in your answers.</li>
              <li><strong>How long:</strong> LabGuide deletes your work {status.retentionDays} days after you last use it. DeepSeek keeps what it receives under its own privacy policy, and LabGuide cannot delete data that DeepSeek already has.</li>
              <li><strong>Cost:</strong> the app pays for DeepSeek, up to US${status.deepseek.dailyCapUsd.toFixed(2)} a day for all students together. After that, the Demo tutor is used until the next day, and it is clearly labelled.</li>
            </ul>
          </section>

          <section className="card stack" aria-labelledby="poe-h">
            <h2 id="poe-h">Poe</h2>
            <div className="status-row">
              <span className="status-dot" data-kind={status.poe.state === 'demo_simulated' ? 'sim' : 'off'} aria-hidden="true" />
              <strong>Status:</strong> {status.poe.label}
            </div>
            {status.poe.state === 'demo_simulated' ? (
              <button className="btn" onClick={() => act(async () => setStatus(await api.disconnectPoe()), 'Poe disconnected (Demo mode). The simulated credential was deleted.')}>
                Disconnect Poe
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setConsentOpen(true)}>Connect Poe <DemoBadge /></button>
            )}
            <p className="hint-text" style={{ margin: 0 }}>
              In this preview the whole Poe sign-in is simulated. No request is sent to Poe.
            </p>
          </section>

          <section className="card stack" aria-labelledby="gem-h">
            <h2 id="gem-h">Gemini</h2>
            <div className="status-row">
              <span className="status-dot" data-kind="off" aria-hidden="true" />
              <strong>Status:</strong> {status.gemini.label}
            </div>
            <p style={{ margin: 0 }}>
              Gemini is managed by your school / app administrator (configured on the server). There is no Gemini
              account sign-in for students. Signing in to Gemini yourself would not let this app use it.
            </p>
          </section>

          <section className="card stack" aria-labelledby="priv-h">
            <h2 id="priv-h">Privacy and your data</h2>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>You use LabGuide with an anonymous student ID{me ? ` (${me.studentId.slice(0, 8)}…)` : ''}. We do not ask for your name or school.</li>
              <li>We keep only what you need to continue: your plan answers, diagrams and tutor messages.</li>
              <li><strong>Your sessions and diagrams are deleted {status.retentionDays} days after you last use them.</strong></li>
              <li>When a real provider is used, your current stage answers and recent tutor messages are sent to it through the LabGuide server (see “DeepSeek AI tutor” above). In Demo mode nothing is sent anywhere.</li>
              <li>Provider keys and tokens stay on the server, encrypted. They never reach your browser.</li>
            </ul>
            <div>
              <label htmlFor="nick">Nickname (optional)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="nick" type="text" maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} />
                <button className="btn" onClick={() => act(async () => setMe(await api.setNickname(nickname)), 'Nickname saved.')}>Save</button>
              </div>
            </div>
            <button className="btn" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> Delete my data</button>
          </section>

          <section className="card stack" aria-labelledby="bill-h">
            <h2 id="bill-h">Points and billing</h2>
            <p style={{ margin: 0 }}>
              If your school turns on Poe, each tutor reply uses points from <strong>your own Poe account</strong>.
              If your school uses Gemini or DeepSeek, the app pays and you use no points. LabGuide never switches you between
              providers without telling you, because their costs and privacy rules are different.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Demo mode uses no points and sends nothing. When the daily DeepSeek limit is reached, LabGuide switches to the
              Demo tutor (which sends nothing) and labels every reply “Demo mode”.
            </p>
          </section>
        </div>
      )}

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Before you connect Poe">
        <div className="stack">
          <p><DemoBadge text="Demo mode – no real connection" /></p>
          <ul style={{ paddingLeft: '1.2rem' }}>
            <li><strong>Points:</strong> Poe tutor replies use points from your own Poe account.</li>
            <li><strong>What is sent:</strong> your current stage answers and recent tutor messages. No name or school.</li>
            <li><strong>Where it goes:</strong> from the LabGuide server to Poe. Your Poe login stays with Poe.</li>
            <li><strong>How to disconnect:</strong> press “Disconnect Poe” in Settings at any time.</li>
          </ul>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 600 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I understand and I agree.</span>
          </label>
          <div className="btn-row">
            {consent ? (
              <a className="btn btn-primary" href="/api/connect/poe/start?consent=yes">Continue (simulated) </a>
            ) : (
              <button className="btn btn-primary" disabled>Continue (simulated)</button>
            )}
            <button className="btn" onClick={() => setConsentOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete my data?">
        <p>This deletes all your investigations, diagrams, tutor messages and any provider connection. It cannot be undone.</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => act(async () => {
            await api.deleteMyData();
            setConfirmDelete(false);
            nav('/');
          }, 'Your data was deleted.')}>Yes, delete everything</button>
          <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      </Modal>
    </main>
  );
}
