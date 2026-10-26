import { hypothesisForm } from '@labguide/shared';
import { useSession } from '../../session';
import { IssueList, SafetyBlocks } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

export function HypothesisStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.hypothesis;
  const form = hypothesisForm(plan.hypothesis);
  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">2. Write your hypothesis</h1>
      <p>A hypothesis is a prediction you can test. Use one of these forms:</p>
      <ul>
        <li><strong>If</strong> … <strong>then</strong> …</li>
        <li><strong>As</strong> [what you change] increases (or decreases), [what you measure] <strong>will</strong> …</li>
      </ul>
      <div className={`answer-card ${v.issues.some((i) => i.severity === 'safety_block') ? 'has-safety' : ''}`}>
        <div className="card-title">
          <label htmlFor="hyp">My hypothesis</label>
          <span className="pill" aria-live="polite">{form ? (form === 'if_then' ? '“If … then …” form found' : '“As … will …” form found') : 'Form not found yet'}</span>
        </div>
        <textarea id="hyp" value={plan.hypothesis} maxLength={400} rows={4}
          aria-describedby="hyp-help"
          onChange={(e) => update('hypothesis', e.target.value)} />
        <p id="hyp-help" className="hint-text" style={{ marginTop: 6 }}>Write it in your own words. The tutor will not write it for you.</p>
      </div>
      <SafetyBlocks issues={v.issues} />
      <IssueList issues={v.issues} />
      <StageFooter stage="hypothesis" />
    </section>
  );
}
