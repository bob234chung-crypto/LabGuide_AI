import { useEffect, useRef, type ReactNode } from 'react';
import type { DiagramCheck, Issue, StageReview } from '@labguide/shared';

const PATHS: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  tag: 'M3 12l9-9h8v8l-9 9zM16 8h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  chat: 'M4 5h16v11H9l-5 4z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L5 7.2 3 7l-1 3 2 1v2l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  close: 'M6 6l12 12M18 6 6 18',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  inside: 'M5 4v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4M12 3v11',
};

export function Icon({ name, size = 20, title }: { name: keyof typeof PATHS | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function DemoBadge({ text = 'Demo mode' }: { text?: string }) {
  return (
    <span className="badge-demo" title="Simulated. No real AI provider wrote this.">
      <Icon name="bulb" size={14} /> {text}
    </span>
  );
}

/** Marks text written by the real AI (through the LabGuide server). */
export function AiBadge({ text = 'AI tutor (DeepSeek)' }: { text?: string }) {
  return (
    <span className="badge-ai" title="Written by the DeepSeek AI model, through the LabGuide server.">
      <Icon name="chat" size={13} /> {text}
    </span>
  );
}

/** Marks a message from LabGuide's own fixed rules (safety stops, built-in checks). */
export function RulesBadge() {
  return (
    <span className="badge-ai badge-rules" title="Written by LabGuide's fixed rules, not by an AI.">
      <Icon name="check" size={13} /> LabGuide checks
    </span>
  );
}

const REVIEW_NOTES: Record<NonNullable<StageReview['fallbackReason']>, string> = {
  not_configured: 'Checked with LabGuide’s built-in checks (Demo mode – no AI tutor on this server).',
  budget: 'The AI tutor has reached today’s limit, so LabGuide used its built-in checks instead.',
  unavailable: 'The AI tutor is not available right now, so LabGuide used its built-in checks instead.',
  invalid_output: 'The AI tutor’s reply could not be used, so LabGuide used its built-in checks instead.',
  suspicious_input: 'LabGuide found words that are not part of a science answer.',
};

/** Amber "Not yet" box with the reviewer's guiding questions. Never shows an answer. */
export function ReviewFeedback({ review }: { review: StageReview }) {
  return (
    <div className="issue issue-hint review-feedback" role="status">
      <span className="tag">Not yet</span>
      <div>
        <p style={{ margin: 0 }}>
          <strong>Your answer needs a little more work before you move on.</strong> Think about{' '}
          {review.feedbackQuestions.length > 1 ? 'these questions' : 'this question'}, change your answer, then press Next again.
        </p>
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
          {review.feedbackQuestions.map((q) => <li key={q}>{q}</li>)}
        </ul>
        <p className="hint-text" style={{ margin: '0.4rem 0 0' }}>
          {review.source === 'ai' ? <AiBadge text="Checked by the AI tutor (DeepSeek)" /> : <RulesBadge />}{' '}
          {review.fallbackReason && REVIEW_NOTES[review.fallbackReason]}
        </p>
      </div>
    </div>
  );
}

export function SafetyBlock({
  message,
  hazard,
  alternative,
  action,
  compact,
}: {
  message: string;
  hazard?: string;
  alternative?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="safety-block" role="alert">
      <h3>
        <Icon name="alert" /> Safety stop
      </h3>
      <p><strong>{message}</strong></p>
      {hazard && !compact && (
        <p><span className="label">Why: </span>{hazard}</p>
      )}
      {alternative && (
        <p><span className="label">Safe way: </span>{alternative}</p>
      )}
      {action && <div className="btn-row" style={{ marginTop: '0.5rem' }}>{action}</div>}
    </div>
  );
}

export function IssueList({ issues, showInfo = true }: { issues: Issue[]; showInfo?: boolean }) {
  const shown = issues.filter((i) => i.severity !== 'safety_block' && (showInfo || i.severity !== 'info'));
  if (!shown.length) return null;
  return (
    <div aria-label="Feedback on this stage">
      {shown.map((i) => (
        <div key={i.ruleId + (i.field ?? '')} className={`issue issue-${i.severity === 'hint' ? 'hint' : 'info'}`}>
          <span className="tag">{i.severity === 'hint' ? 'Hint' : i.required ? 'To do' : 'Note'}</span>
          <span>{i.message}</span>
        </div>
      ))}
    </div>
  );
}

export function SafetyBlocks({ issues, action }: { issues: Issue[]; action?: (i: Issue) => ReactNode }) {
  const blocks = issues.filter((i) => i.severity === 'safety_block');
  if (!blocks.length) return null;
  return (
    <div className="stack">
      {blocks.map((b) => (
        <SafetyBlock key={b.ruleId + b.stage + (b.field ?? '')} message={b.message} hazard={b.hazard} alternative={b.alternative} action={action?.(b)} />
      ))}
    </div>
  );
}

export function CheckList({ checks }: { checks: DiagramCheck[] }) {
  const blocks = checks.filter((c) => c.severity === 'safety_block' && !c.passed);
  const open = checks.filter((c) => c.severity !== 'safety_block' && !c.passed);
  const passed = checks.filter((c) => c.passed);
  return (
    <div className="stack">
      {blocks.map((c) => (
        <SafetyBlock key={c.ruleId} message={c.message} hazard={c.hazard} alternative={c.alternative} />
      ))}
      {open.map((c) => (
        <div key={c.ruleId} className={`issue issue-${c.severity === 'hint' ? 'hint' : 'info'}`}>
          <span className="tag">{c.severity === 'hint' ? 'Hint' : 'Note'}</span>
          <span>{c.message}</span>
        </div>
      ))}
      {passed.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 32 }}>{passed.length} checks passed</summary>
          {passed.map((c) => (
            <div key={c.ruleId} className="issue issue-ok" style={{ marginTop: 6 }}>
              <Icon name="check" /> <span>{c.message}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dlg-title">
      <div className="dialog-head">
        <h2 id="dlg-title" style={{ margin: 0 }}>{title}</h2>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export const GLOSSARY: [string, string][] = [
  ['Hypothesis', 'A prediction that you can test. For example: "If … then …".'],
  ['Independent variable', 'The one thing you change on purpose.'],
  ['Dependent variable', 'The thing you measure to see the effect.'],
  ['Controlled variable', 'Something you keep the same so the test is fair.'],
  ['Fair test', 'A test where you change only one thing and keep everything else the same.'],
  ['Reliable', 'You get similar results when you repeat the test.'],
  ['Precise', 'The tool can show small differences, for example a scale with small divisions.'],
  ['Accurate', 'The result is close to the true value.'],
  ['Apparatus', 'The equipment you use in an experiment.'],
  ['Sectional diagram', 'A flat, side-view drawing that shows a cut through the apparatus.'],
  ['Water bath', 'A container of hot water used to heat something gently, with no flame.'],
];

export function Glossary({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Glossary">
      <dl className="glossary">
        {GLOSSARY.map(([t, d]) => (
          <div key={t}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export function useAnnouncer() {
  const ref = useRef<HTMLDivElement>(null);
  const announce = (text: string) => {
    const el = ref.current;
    if (!el) return;
    el.textContent = '';
    window.setTimeout(() => {
      el.textContent = text;
    }, 30);
  };
  const region = <div ref={ref} className="sr-only" aria-live="polite" aria-atomic="true" />;
  return { announce, region };
}

export function ErrorState({ message, onRetry, onLater }: { message: string; onRetry?: () => void; onLater?: () => void }) {
  return (
    <div className="notice" role="status">
      <p style={{ marginBottom: '0.5rem' }}><strong>{message}</strong></p>
      <div className="btn-row">
        {onRetry && <button className="btn btn-primary btn-small" onClick={onRetry}>Retry</button>}
        {onLater && <button className="btn btn-small" onClick={onLater}>Continue later</button>}
      </div>
    </div>
  );
}
