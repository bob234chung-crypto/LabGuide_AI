import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { TextCard } from '@labguide/shared';
import { useSession } from '../../session';
import { Icon, IssueList, SafetyBlock, useAnnouncer } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

let counter = 0;
const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export function ProcedureStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.procedure;
  const steps = plan.procedure;
  const { announce, region } = useAnnouncer();
  const listRef = useRef<HTMLOListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const set = (next: TextCard[]) => update('procedure', next);

  function move(from: number, to: number, focus = true) {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = steps.slice();
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    set(next);
    announce(`Step moved from position ${from + 1} to position ${to + 1}.`);
    if (focus) window.setTimeout(() => document.getElementById(`step-${s.id}`)?.focus(), 30);
  }

  function add() {
    const id = newId();
    set([...steps, { id, text: '' }]);
    announce(`Step ${steps.length + 1} added.`);
    window.setTimeout(() => document.getElementById(`step-${id}`)?.focus(), 30);
  }

  function remove(i: number) {
    set(steps.filter((_, j) => j !== i));
    announce(`Step ${i + 1} deleted.`);
  }

  function onHandleDown(e: RPointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  }
  function onHandleMove(e: RPointerEvent<HTMLButtonElement>) {
    if (!dragId || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLLIElement>(':scope > li')];
    const from = steps.findIndex((s) => s.id === dragId);
    let to = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (to === -1) to = rows.length - 1;
    if (to > from) to = Math.max(from, to - 1);
    if (to !== from) move(from, to, false);
  }
  function onHandleUp() {
    setDragId(null);
  }

  const blocksFor = (id: string) => v.issues.filter((i) => i.severity === 'safety_block' && i.field === id);
  const otherIssues = v.issues.filter((i) => i.severity !== 'safety_block');

  return (
    <section className="stack" aria-labelledby="stage-h">
      {region}
      <h1 id="stage-h">5. Procedure</h1>
      <p>Write the steps in order. Start each step with an action word, such as “Measure”, “Place” or “Record”.</p>
      <p className="hint-text">To reorder, drag the handle, or use the Up and Down buttons.</p>
      <ol className="steps" ref={listRef} aria-label="Procedure steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`step ${dragId === s.id ? 'dragging' : ''}`}>
            <button className="btn btn-icon drag-handle" aria-label={`Drag to reorder step ${i + 1}`} tabIndex={-1}
              onPointerDown={(e) => onHandleDown(e, s.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
              <Icon name="grip" />
            </button>
            <span className="num" aria-hidden="true">{i + 1}.</span>
            <div className={`answer-card ${blocksFor(s.id).length ? 'has-safety' : ''}`} style={{ padding: '0.5rem' }}>
              <label htmlFor={`step-${s.id}`} className="sr-only">Step {i + 1}</label>
              <textarea id={`step-${s.id}`} rows={2} maxLength={300} value={s.text} style={{ minHeight: 60 }}
                onChange={(e) => set(steps.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))} />
              <div className="step-tools" style={{ marginTop: 6 }}>
                <button className="btn btn-small" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                  <Icon name="up" /> Up
                </button>
                <button className="btn btn-small" onClick={() => move(i, i + 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>
                  <Icon name="down" /> Down
                </button>
                <button className="btn btn-small" onClick={() => remove(i)} aria-label={`Delete step ${i + 1}`}>
                  <Icon name="trash" /> Delete
                </button>
              </div>
              {blocksFor(s.id).map((b) => (
                <div key={b.ruleId} style={{ marginTop: 8 }}>
                  <SafetyBlock message={b.message} hazard={b.hazard} alternative={b.alternative} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button className="btn" onClick={add} disabled={steps.length >= 20}>
        <Icon name="plus" /> Add a step
      </button>
      <IssueList issues={otherIssues} />
      <StageFooter stage="procedure" />
    </section>
  );
}
