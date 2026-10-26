import { THEMES, type ThemeId, type ThemeInfo } from '@labguide/shared';
import { useSession } from '../../session';
import { IssueList, SafetyBlocks } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

function ThemeChoices({
  themes,
  selected,
  labelledBy,
  fallbackId,
  onChoose,
}: {
  themes: ThemeInfo[];
  selected: ThemeId | null;
  labelledBy: string;
  fallbackId?: ThemeId;
  onChoose: (theme: ThemeId) => void;
}) {
  return (
    <div className="choice-grid" role="radiogroup" aria-labelledby={labelledBy}>
      {themes.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={selected === t.id}
          className="choice choice-theme" onClick={() => onChoose(t.id)}
          onKeyDown={(e) => {
            const i = themes.findIndex((x) => x.id === t.id);
            const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const n = themes[(i + d + themes.length) % themes.length];
            onChoose(n.id);
            (e.currentTarget.parentElement?.children[themes.indexOf(n)] as HTMLElement)?.focus();
          }}
          tabIndex={selected ? (selected === t.id ? 0 : -1) : t.id === fallbackId ? 0 : -1}>
          <span className="check" aria-hidden="true">{selected === t.id ? '✓' : ''}</span>
          <span className="choice-body">
            <span className="choice-copy">
              <strong>{t.title}</strong>
              <span className="muted">{t.blurb}</span>
            </span>
            {t.note ? <span className="choice-note">{t.note}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ThemeStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.theme;
  const choose = (theme: ThemeId) => update('theme', { ...plan.theme, theme });
  const ungrouped = THEMES.filter((t) => !t.group);
  const groups = [...new Set(THEMES.map((t) => t.group).filter((g): g is string => !!g))];
  return (
    <section className="stack" aria-labelledby="stage-h">
      <div className="stage-head">
        <h1 id="stage-h">1. Choose a theme</h1>
      </div>
      <p>Pick the topic for your fair test. You can change it later.</p>
      <ThemeChoices themes={ungrouped} selected={plan.theme.theme} labelledBy="stage-h" fallbackId="photosynthesis" onChoose={choose} />
      {groups.map((group) => {
        const headingId = `theme-group-${group.replace(/\s+/g, '-').toLowerCase()}`;
        return (
          <div key={group} className="theme-group">
            <h2 id={headingId}>{group}</h2>
            <p className="muted">You do these practicals in the school laboratory, with your teacher.</p>
            <ThemeChoices themes={THEMES.filter((t) => t.group === group)} selected={plan.theme.theme} labelledBy={headingId} onChoose={choose} />
          </div>
        );
      })}
      {plan.theme.theme === 'custom' && (
        <div className="answer-card">
          <label htmlFor="custom-title">Your topic title <span className="hint-text">(a short title, for example “Bouncing balls”)</span></label>
          <input id="custom-title" type="text" maxLength={80} value={plan.theme.customTitle}
            onChange={(e) => update('theme', { ...plan.theme, customTitle: e.target.value })} />
        </div>
      )}
      <SafetyBlocks issues={v.issues} />
      <IssueList issues={v.issues} />
      <StageFooter stage="theme" />
    </section>
  );
}
