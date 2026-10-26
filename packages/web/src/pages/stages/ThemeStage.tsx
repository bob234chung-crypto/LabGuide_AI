import { THEMES, type ThemeId } from '@labguide/shared';
import { useSession } from '../../session';
import { IssueList, SafetyBlocks } from '../../components/ui';
import { StageFooter } from '../SessionRoute';

export function ThemeStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.theme;
  const choose = (theme: ThemeId) => update('theme', { ...plan.theme, theme });
  return (
    <section className="stack" aria-labelledby="stage-h">
      <div className="stage-head">
        <h1 id="stage-h">1. Choose a theme</h1>
      </div>
      <p>Pick the topic for your fair test. You can change it later.</p>
      <div className="choice-grid" role="radiogroup" aria-labelledby="stage-h">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={plan.theme.theme === t.id}
            className="choice" onClick={() => choose(t.id)}
            onKeyDown={(e) => {
              const i = THEMES.findIndex((x) => x.id === t.id);
              const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
              if (d) {
                e.preventDefault();
                const n = THEMES[(i + d + THEMES.length) % THEMES.length];
                choose(n.id);
                (e.currentTarget.parentElement?.children[THEMES.indexOf(n)] as HTMLElement)?.focus();
              }
            }}
            tabIndex={plan.theme.theme ? (plan.theme.theme === t.id ? 0 : -1) : t.id === 'photosynthesis' ? 0 : -1}>
            <span className="check" aria-hidden="true">{plan.theme.theme === t.id ? '✓' : ''}</span>
            <span>
              <strong>{t.title}</strong>
              <br />
              <span className="muted">{t.blurb}</span>
              {t.note && <><br /><span className="pill">{t.note}</span></>}
            </span>
          </button>
        ))}
      </div>
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
