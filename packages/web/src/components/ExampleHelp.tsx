import { useState } from 'react';
import type { ReviewedStage } from '@labguide/shared';
import { api } from '../api';
import { useRequestGate } from '../hooks';
import { errorMessage, useSession } from '../session';
import { ErrorState, ExampleAnswerBox } from './ui';

/**
 * After 3 failed checks on this stage, the student may open one example.
 * The button stays hidden until then. Opening it does not reset if they edit.
 */
export function ExampleHelp({ stage }: { stage: ReviewedStage }) {
  const { session, applyServer, flush } = useSession();
  const gate = useRequestGate();
  const [error, setError] = useState<string | null>(null);
  const shown = session.shownExamples?.[stage];
  const fails = session.failedChecks?.[stage] ?? 0;
  if (!shown && fails < 3) return null;

  async function reveal() {
    setError(null);
    await gate.tryRun('example', async () => {
      try {
        await flush();
        const res = await api.showExample(session.id, stage);
        applyServer(res.session);
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <div className="stack">
      {shown && <ExampleAnswerBox text={shown.text} demo={shown.demo} />}
      {!shown && (
        <button className="btn" type="button" aria-busy={gate.busy('example')} onClick={() => void reveal()}>
          Show an example answer
        </button>
      )}
      {error && <ErrorState message={error} onRetry={() => void reveal()} onLater={() => setError(null)} />}
    </div>
  );
}
