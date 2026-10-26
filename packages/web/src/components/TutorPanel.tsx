import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppStage, ChatMessage, ChatRequest } from '@labguide/shared';
import { api } from '../api';
import { useSession, errorMessage } from '../session';
import { DemoBadge, ErrorState, Icon } from './ui';

export function TutorPanel({ stage, onClose, headingId }: { stage: AppStage; onClose?: () => void; headingId: string }) {
  const { session, setChat, flush } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: ChatRequest & { retry?: boolean } } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const messages = session.chat.filter((m) => m.stage === stage);
  const hintLevel = session.hintLevels[stage] ?? 0;

  async function send(req: ChatRequest & { retry?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await flush();
      const res = await api.chat(session.id, req);
      setChat((chat) => [...chat, ...res.messages]);
      if (req.type === 'message') setText('');
    } catch (err) {
      const e = err as { body?: { saved?: ChatMessage[] } };
      const saved = e.body?.saved ?? [];
      if (saved.length) setChat((chat) => [...chat, ...saved]);
      if (req.type === 'message') setText('');
      setError({ message: errorMessage(err), retry: { ...req, retry: saved.length > 0 || req.retry } });
    } finally {
      setBusy(false);
    }
  }

  const entered = useRef(new Set<string>());
  useEffect(() => {
    const key = `${session.id}:${stage}`;
    if (!entered.current.has(key) && !session.chat.some((m) => m.stage === stage && m.role === 'tutor')) {
      entered.current.add(key);
      void send({ type: 'enter', stage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, session.id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) void send({ type: 'message', stage, text: text.trim() });
  }

  return (
    <section className="tutor" aria-labelledby={headingId}>
      <div className="tutor-head">
        <div>
          <h2 id={headingId} style={{ margin: 0, fontSize: '1.1rem' }}>Tutor</h2>
          <DemoBadge text="Demo mode – simulated tutor" />
        </div>
        {onClose && (
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close tutor">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="tutor-log" ref={logRef} role="log" aria-live="polite" aria-label="Tutor conversation">
        {messages.length === 0 && !busy && <p className="muted">The tutor will ask you questions. It will not write your answers.</p>}
        {messages.map((m) =>
          m.role === 'student' ? (
            <div key={m.id} className="msg msg-student">
              <div className="msg-meta">You</div>
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`msg msg-tutor ${m.kind === 'hint' ? 'msg-hint' : ''} ${m.kind === 'safety' ? 'msg-safety' : ''}`}>
              <div className="msg-meta">
                {m.kind === 'safety' ? (
                  <><Icon name="alert" size={16} /> Safety</>
                ) : m.kind === 'hint' ? (
                  <><Icon name="bulb" size={16} /> Hint {m.hintLevel} of 3</>
                ) : (
                  'Tutor'
                )}
                {m.demo && <DemoBadge />}
              </div>
              {m.text && <p style={{ margin: 0 }}>{m.text}</p>}
              {m.questions.length > 0 && (
                <ul aria-label="Questions to think about">
                  {m.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {busy && <p className="muted" aria-live="polite">Tutor is thinking…</p>}
      </div>
      {error && (
        <div className="tutor-error">
          <ErrorState message={error.message} onRetry={() => void send(error.retry)} onLater={() => setError(null)} />
        </div>
      )}
      <div className="tutor-actions">
        <div className="btn-row">
          <button className="btn btn-small" disabled={busy} onClick={() => void send({ type: 'check', stage })}>
            <Icon name="check" /> Check my work
          </button>
          <button className="btn btn-small" disabled={busy || hintLevel >= 3} onClick={() => void send({ type: 'hint', stage })}
            style={{ borderColor: 'var(--amber-line)', background: hintLevel >= 3 ? undefined : 'var(--amber-bg)' }}>
            <Icon name="bulb" /> {hintLevel >= 3 ? 'All 3 hints used' : `Get hint ${hintLevel + 1} of 3`}
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor={`${headingId}-input`} className="sr-only">Ask the tutor a question</label>
          <input id={`${headingId}-input`} type="text" value={text} maxLength={500} placeholder="Ask a question…"
            onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      </div>
    </section>
  );
}
