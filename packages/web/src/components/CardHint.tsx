import { useState } from 'react';
import type { ReviewedStage, TutorReply } from '@labguide/shared';
import { api } from '../api';
import { applyCopiedSentence } from '../copyAnswer';
import { errorMessage, useSession } from '../session';

/** Hints for one failed card. Hidden by the parent once that card passes. */
export function CardHint({ stage, boxId }: { stage: ReviewedStage; boxId: string }) {
  const { session, plan, update, setChat, flush } = useSession();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hints = session.chat.filter(
    (m): m is TutorReply => m.role === 'tutor' && m.stage === stage && m.boxId === boxId && m.hintLevel != null,
  );
  const level = hints.reduce((n, m) => Math.max(n, m.hintLevel ?? 0), 0);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await flush();
      const res = await api.chat(session.id, { type: 'hint', stage, boxId });
      setChat((chat) => [...chat, ...res.messages]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function copy(sentence: string) {
    if (stage === 'hypothesis') {
      update('hypothesis', applyCopiedSentence(plan.hypothesis, sentence));
      window.setTimeout(() => document.getElementById('hyp')?.focus(), 0);
      return;
    }
    if (stage === 'variables') {
      if (boxId === 'independent') {
        update('variables', { ...plan.variables, independent: applyCopiedSentence(plan.variables.independent, sentence) });
        window.setTimeout(() => document.getElementById('iv')?.focus(), 0);
        return;
      }
      if (boxId === 'dependent') {
        update('variables', { ...plan.variables, dependent: applyCopiedSentence(plan.variables.dependent, sentence) });
        window.setTimeout(() => document.getElementById('dv')?.focus(), 0);
        return;
      }
      update('variables', {
        ...plan.variables,
        controlled: plan.variables.controlled.map((c) =>
          c.id === boxId ? { ...c, text: applyCopiedSentence(c.text, sentence) } : c,
        ),
      });
      window.setTimeout(() => document.getElementById(`cv-${boxId}`)?.focus(), 0);
      return;
    }
    if (stage === 'apparatus') {
      update('apparatus', {
        ...plan.apparatus,
        justifications: {
          ...plan.apparatus.justifications,
          [boxId]: applyCopiedSentence(plan.apparatus.justifications[boxId] ?? '', sentence),
        },
      });
      window.setTimeout(() => document.getElementById(`just-${boxId}`)?.focus(), 0);
      return;
    }
    update(
      'procedure',
      plan.procedure.map((s) => (s.id === boxId ? { ...s, text: applyCopiedSentence(s.text, sentence) } : s)),
    );
    window.setTimeout(() => document.getElementById(`step-${boxId}`)?.focus(), 0);
  }

  return (
    <div className="card-hint" data-card-hint={boxId}>
      {hints.map((m) => {
        const choice = m.choices?.find((c) => c.id === picked[m.id]);
        return (
          <div key={m.id} className="stack">
            <p className="hint-text" style={{ margin: 0 }}>Hint {m.hintLevel} of 3</p>
            {m.text && <p style={{ margin: 0 }}>{m.text}</p>}
            {m.questions.length > 0 && (
              <ul aria-label="Questions to think about">
                {m.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            )}
            {m.choices && m.choices.length > 0 && (
              <div className="hint-choices" role="group" aria-label="Choices for this practical">
                {m.choices.map((c) => (
                  <button key={c.id} type="button" className="btn btn-small" aria-pressed={picked[m.id] === c.id} onClick={() => setPicked((prev) => ({ ...prev, [m.id]: c.id }))}>
                    {c.text}
                  </button>
                ))}
                {choice?.why && <p className="hint-why" role="status">{choice.why}</p>}
                {choice && !choice.why && (
                  <div className="hint-good" role="status">
                    <p style={{ margin: 0 }}>{choice.text}</p>
                    <button type="button" className="btn btn-small" onClick={() => copy(choice.text)}>
                      Copy into my answer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {level < 3 && (
        <button type="button" className="btn btn-small" onClick={() => void ask()} disabled={busy} aria-busy={busy}>
          {busy ? 'Thinking…' : `Get hint ${level + 1} of 3`}
        </button>
      )}
      {error && <p className="hint-text" role="alert">{error}</p>}
    </div>
  );
}
