import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppStage, ChatMessage, ChatRequest, HintChoice, TutorReply } from '@labguide/shared';
import { api } from '../api';
import { applyCopiedSentence } from '../copyAnswer';
import { useSession, errorMessage } from '../session';
import { AiBadge, DemoBadge, ErrorState, Icon, RulesBadge } from './ui';
import { useRequestGate } from '../hooks';
import { refreshProviderStatus, usesRealAi, useProviderStatus } from '../providerStatus';

/** Says honestly who wrote each reply. Only real DeepSeek replies get the AI label. */
function ReplyLabel({ m }: { m: TutorReply }) {
  if (m.choices?.length) return m.demo ? <DemoBadge /> : null;
  if (m.provider === 'deepseek') return <AiBadge />;
  if (m.provider === 'rules') return <RulesBadge />;
  if (m.fallback === 'budget') return <DemoBadge text="Demo mode – daily AI limit reached" />;
  if (m.fallback === 'invalid_output') return <DemoBadge text="Demo mode – built-in safe reply" />;
  if (m.fallback === 'retrieval') return <DemoBadge text="Demo mode – lesson not found" />;
  return m.demo ? <DemoBadge /> : null;
}

function HintChoices({
  choices,
  pickedId,
  onPick,
  onCopy,
}: {
  choices: HintChoice[];
  pickedId?: string;
  onPick: (id: string) => void;
  onCopy: (sentence: string) => void;
}) {
  const picked = choices.find((c) => c.id === pickedId);
  return (
    <div className="hint-choices" role="group" aria-label="Choices for this practical">
      {choices.map((c) => (
        <button key={c.id} type="button" className="btn btn-small" aria-pressed={pickedId === c.id} onClick={() => onPick(c.id)}>
          {c.text}
        </button>
      ))}
      {picked?.why && <p className="hint-why" role="status">{picked.why}</p>}
      {picked && !picked.why && (
        <div className="hint-good" role="status">
          <p style={{ margin: 0 }}>{picked.text}</p>
          <button type="button" className="btn btn-small" onClick={() => onCopy(picked.text)}>
            Copy into my answer
          </button>
        </div>
      )}
    </div>
  );
}

export function TutorPanel({ stage, onClose, headingId }: { stage: AppStage; onClose?: () => void; headingId: string }) {
  const { session, setChat, flush, plan, update } = useSession();
  const status = useProviderStatus();
  const [text, setText] = useState('');
  const gate = useRequestGate();
  const busy = gate.busy();
  const [error, setError] = useState<{ message: string; retry: ChatRequest & { retry?: boolean } } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const messages = session.chat.filter((m) => m.stage === stage);
  const hintLevel = session.hintLevels[stage] ?? 0;

  async function request(req: ChatRequest & { retry?: boolean }) {
    setError(null);
    try {
      await flush();
      const res = await api.chat(session.id, req);
      setChat((chat) => [...chat, ...res.messages]);
      if (res.messages.some((m) => m.role === 'tutor' && m.fallback === 'budget') && usesRealAi(status)) {
        void refreshProviderStatus();
      }
      if (req.type === 'message') setText('');
    } catch (err) {
      const e = err as { body?: { saved?: ChatMessage[] } };
      const saved = e.body?.saved ?? [];
      if (saved.length) setChat((chat) => [...chat, ...saved]);
      if (req.type === 'message') setText('');
      setError({ message: errorMessage(err), retry: { ...req, retry: saved.length > 0 || req.retry } });
    }
  }
  const send = (req: ChatRequest & { retry?: boolean }) => gate.tryRun(req.type, () => request(req));

  const entered = useRef(new Set<string>());
  useEffect(() => {
    const key = `${session.id}:${stage}`;
    if (!entered.current.has(key) && !session.chat.some((m) => m.stage === stage && m.role === 'tutor')) {
      entered.current.add(key);
      void gate.track(() => request({ type: 'enter', stage }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, session.id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length]);

  function copyInto(sentence: string) {
    if (stage === 'hypothesis') {
      update('hypothesis', applyCopiedSentence(plan.hypothesis, sentence));
      window.setTimeout(() => document.getElementById('hyp')?.focus(), 0);
      return;
    }
    if (stage === 'variables') {
      update('variables', { ...plan.variables, independent: applyCopiedSentence(plan.variables.independent, sentence) });
      window.setTimeout(() => document.getElementById('iv')?.focus(), 0);
      return;
    }
    if (stage === 'apparatus') {
      const id =
        plan.apparatus.selected.find((item) => !(plan.apparatus.justifications[item] ?? '').trim()) ?? plan.apparatus.selected[0];
      if (!id) return;
      update('apparatus', {
        ...plan.apparatus,
        justifications: {
          ...plan.apparatus.justifications,
          [id]: applyCopiedSentence(plan.apparatus.justifications[id] ?? '', sentence),
        },
      });
      window.setTimeout(() => document.getElementById(`just-${id}`)?.focus(), 0);
      return;
    }
    if (stage === 'procedure') {
      const steps = plan.procedure.length ? plan.procedure : [{ id: 's1', text: '' }];
      const empty = steps.findIndex((s) => !s.text.trim());
      const index = empty === -1 ? 0 : empty;
      update(
        'procedure',
        steps.map((s, n) => (n === index ? { ...s, text: applyCopiedSentence(s.text, sentence) } : s)),
      );
      window.setTimeout(() => document.getElementById(`step-${steps[index].id}`)?.focus(), 0);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) void send({ type: 'message', stage, text: text.trim() });
  }

  return (
    <section className="tutor" aria-labelledby={headingId}>
      <div className="tutor-head">
        <div>
          <h2 id={headingId} style={{ margin: 0, fontSize: '1.1rem' }}>Tutor</h2>
          {status &&
            (usesRealAi(status) ? (
              <AiBadge />
            ) : status.deepseek.budgetReached ? (
              <DemoBadge text="Demo mode – today’s AI limit reached" />
            ) : (
              <DemoBadge text="Demo mode – simulated tutor" />
            ))}
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
                <ReplyLabel m={m} />
              </div>
              {m.practical && <p className="using-practical">Using this practical: {m.practical}</p>}
              {m.text && <p style={{ margin: 0 }}>{m.text}</p>}
              {m.choices && m.choices.length > 0 && (
                <HintChoices
                  choices={m.choices}
                  pickedId={picked[m.id]}
                  onPick={(id) => setPicked((prev) => ({ ...prev, [m.id]: id }))}
                  onCopy={copyInto}
                />
              )}
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
          <button className="btn btn-small" aria-busy={gate.busy('check')} onClick={() => void send({ type: 'check', stage })}>
            <Icon name="check" /> Check my work
          </button>
          <button className="btn btn-small" aria-busy={gate.busy('hint')} disabled={hintLevel >= 3} onClick={() => void send({ type: 'hint', stage })}
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
