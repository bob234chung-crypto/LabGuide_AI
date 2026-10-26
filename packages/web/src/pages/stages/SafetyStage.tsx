import { Link } from 'react-router-dom';
import { STAGE_TITLES } from '@labguide/shared';
import { useSession } from '../../session';
import { Icon, IssueList, SafetyBlocks } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

export function SafetyStage() {
  const { session, plan, update, validation, checklist } = useSession();
  const v = validation.stages.safety;
  const blocks = validation.safetyBlocks;
  const toggle = (id: string, on: boolean) =>
    update('safety', { checklist: { ...plan.safety.checklist, [id]: on } });

  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">6. Safety review</h1>
      <p>LabGuide checks your plan for hazards using fixed safety rules. Then tick every item on the checklist.</p>

      <div className="card">
        <h2>Hazard check</h2>
        {blocks.length === 0 ? (
          <div className="issue issue-ok" role="status"><Icon name="check" /> No dangerous steps found in your plan.</div>
        ) : (
          <SafetyBlocks
            issues={blocks}
            action={(b) =>
              b.stage !== 'safety' ? (
                <Link className="btn btn-small" to={`/s/${session.id}/${b.stage}`}>
                  <Icon name="pencil" /> Edit {STAGE_TITLES[b.stage]}
                </Link>
              ) : null
            }
          />
        )}
      </div>

      <fieldset className="card" style={{ margin: 0 }}>
        <legend style={{ fontWeight: 800, fontSize: '1.15rem', padding: '0 0.3rem' }}>Safety checklist</legend>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {checklist.map((item) => (
            <li key={item.id}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 500, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!plan.safety.checklist[item.id]} onChange={(e) => toggle(item.id, e.target.checked)} />
                <span>
                  {item.text}
                  {item.reason && <><br /><span className="hint-text">Added because: {item.reason}</span></>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <IssueList issues={v.issues} />
      <StageFooter stage="safety" />
    </section>
  );
}
