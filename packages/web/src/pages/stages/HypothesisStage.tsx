import { hypothesisWritten } from '@labguide/shared';
import { BoxResult } from '../../components/BoxResult';
import { useSession } from '../../session';
import { IssueList, SafetyBlocks } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

export function HypothesisStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.hypothesis;
  const written = hypothesisWritten(plan.hypothesis);
  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">2. Write your hypothesis</h1>
      <p>
        Write your idea as a sentence you can test. Say what you change and what you look at. Imperfect English is fine. For example: If the lamp is closer, the pondweed makes more bubbles.
      </p>
      <div className={`answer-card ${v.issues.some((i) => i.severity === 'safety_block') ? 'has-safety' : ''}`}>
        <div className="card-title">
          <label htmlFor="hyp">My hypothesis</label>
          <span className="pill" aria-live="polite">{written ? 'Sentence saved' : 'Write a sentence'}</span>
        </div>
        <textarea id="hyp" value={plan.hypothesis} maxLength={400} rows={4}
          aria-describedby="hyp-help"
          onChange={(e) => update('hypothesis', e.target.value)} />
        <BoxResult stage="hypothesis" boxId="hypothesis" text={plan.hypothesis} />
        <p id="hyp-help" className="hint-text" style={{ marginTop: 6 }}>Write it in your own words. The tutor will not write it for you.</p>
      </div>
      <SafetyBlocks issues={v.issues} />
      <IssueList issues={v.issues} />
      <StageFooter stage="hypothesis" />
    </section>
  );
}
