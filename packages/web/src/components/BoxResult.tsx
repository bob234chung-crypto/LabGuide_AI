import { boxAnswerKey, goodCardReply, notYetReply, type AnswerBoxKind, type ReviewFallbackReason, type ReviewedStage } from '@labguide/shared';
import { useSession } from '../session';

function kindFor(stage: ReviewedStage, boxId: string): AnswerBoxKind {
  if (boxId === 'hypothesis' || boxId === 'independent' || boxId === 'dependent') return boxId;
  if (stage === 'apparatus') return 'justification';
  if (stage === 'procedure') return 'step';
  return 'controlled';
}

const NOTES: Record<ReviewFallbackReason, string> = {
  not_configured: 'Checked with LabGuide’s built-in checks (Demo mode).',
  budget: 'The AI tutor has reached today’s limit, so LabGuide used its built-in check for this card.',
  unavailable: 'The AI tutor is not available right now, so LabGuide used its built-in check for this card.',
  invalid_output: 'The AI tutor’s reply could not be used, so LabGuide used its built-in check for this card.',
  suspicious_input: 'LabGuide found words that are not part of a science answer.',
  retrieval: 'The lesson for this practical was not found, so LabGuide used its built-in check for this card.',
};

/** The result of the last Next check for one card. Hidden until Next, and hidden again if the text changes. */
export function BoxResult({ stage, boxId, text }: { stage: ReviewedStage; boxId: string; text: string }) {
  const { session, plan } = useSession();
  const box = session.stageReviews?.[stage]?.boxes?.find((b) => b.id === boxId);
  if (!box || box.answerKey !== boxAnswerKey(plan.theme.theme, boxId, text)) return null;
  if (box.passed) {
    return (
      <p className="box-ok" role="status" data-box-result="ok">
        {goodCardReply(kindFor(stage, boxId), text)}
      </p>
    );
  }
  return (
    <div className="issue issue-hint box-result" role="status" data-box-result="not-yet">
      <p style={{ margin: 0 }}>{notYetReply(box.question)}</p>
      {box.fallbackReason && <p className="hint-text" style={{ margin: '0.35rem 0 0' }}>{NOTES[box.fallbackReason]}</p>}
    </div>
  );
}
