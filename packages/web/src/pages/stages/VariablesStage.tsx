import { useRef } from 'react';
import { CONTROL_MAX } from '@labguide/shared';
import { BoxResult } from '../../components/BoxResult';
import { useSession } from '../../session';
import { Icon, IssueList, SafetyBlocks, useAnnouncer } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export function VariablesStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.variables;
  const vars = plan.variables;
  const { announce, region } = useAnnouncer();
  const listRef = useRef<HTMLDivElement>(null);
  const fieldIssues = (field: string) => v.issues.filter((i) => i.field === field);

  function addControlled() {
    const id = newId();
    update('variables', { ...vars, controlled: [...vars.controlled, { id, text: '' }] });
    announce('New controlled variable card added.');
    window.setTimeout(() => document.getElementById(`cv-${id}`)?.focus(), 30);
  }

  return (
    <section className="stack" aria-labelledby="stage-h">
      {region}
      <h1 id="stage-h">3. Variables</h1>
      <p>In a fair test you change one thing, measure one thing, and keep other things the same.</p>

      <div className="answer-card">
        <label htmlFor="iv">Independent variable <span className="hint-text">— the one thing you change</span></label>
        <input id="iv" type="text" maxLength={160} value={vars.independent}
          onChange={(e) => update('variables', { ...vars, independent: e.target.value })} />
        <BoxResult stage="variables" boxId="independent" text={vars.independent} />
        <div style={{ marginTop: 6 }}><IssueList issues={fieldIssues('independent')} /></div>
      </div>

      <div className="answer-card">
        <label htmlFor="dv">Dependent variable <span className="hint-text">— what you measure</span></label>
        <input id="dv" type="text" maxLength={160} value={vars.dependent}
          onChange={(e) => update('variables', { ...vars, dependent: e.target.value })} />
        <BoxResult stage="variables" boxId="dependent" text={vars.dependent} />
        <div style={{ marginTop: 6 }}><IssueList issues={fieldIssues('dependent')} /></div>
      </div>

      <fieldset className="answer-card" style={{ margin: 0 }}>
        <legend style={{ fontWeight: 700, padding: '0 0.3rem' }}>Controlled variables <span className="hint-text">— keep these the same (at least 2)</span></legend>
        <div ref={listRef} className="stack">
          {vars.controlled.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor={`cv-${c.id}`}>Controlled variable {i + 1}</label>
                <input id={`cv-${c.id}`} type="text" maxLength={160} value={c.text}
                  onChange={(e) =>
                    update('variables', {
                      ...vars,
                      controlled: vars.controlled.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)),
                    })
                  } />
                <BoxResult stage="variables" boxId={c.id} text={c.text} />
              </div>
              <button className="btn btn-icon" aria-label={`Remove controlled variable ${i + 1}`}
                onClick={() => {
                  update('variables', { ...vars, controlled: vars.controlled.filter((x) => x.id !== c.id) });
                  announce(`Controlled variable ${i + 1} removed.`);
                }}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        {vars.controlled.length >= CONTROL_MAX ? (
          <p className="hint-text" style={{ marginTop: 10 }}>Four extra cards is enough.</p>
        ) : (
          <button className="btn" style={{ marginTop: 10 }} onClick={addControlled}>
            <Icon name="plus" /> Add a controlled variable
          </button>
        )}
      </fieldset>

      <SafetyBlocks issues={v.issues} />
      <IssueList issues={v.issues.filter((i) => i.field !== 'independent' && i.field !== 'dependent')} />
      <StageFooter stage="variables" />
    </section>
  );
}
