import { useState } from 'react';
import type { Apparatus } from '@labguide/shared';
import { BoxResult } from '../../components/BoxResult';
import { useSession } from '../../session';
import { ErrorState, IssueList, SafetyBlocks } from '../../components/ui';
import { ApparatusThumb } from '../../canvas/ApparatusSvg';
import { useApparatusLibrary } from '../../useApparatus';
import { StageFooter } from '../SessionRoute';

export function ApparatusStage() {
  const { plan, update, validation } = useSession();
  const v = validation.stages.apparatus;
  const { data, all, error, retry } = useApparatusLibrary(plan.theme.theme);
  const [query, setQuery] = useState('');
  const a = plan.apparatus;

  function toggle(id: string) {
    const selected = a.selected.includes(id) ? a.selected.filter((x) => x !== id) : [...a.selected, id];
    update('apparatus', { ...a, selected });
  }

  const isCustom = plan.theme.theme === 'custom' || !plan.theme.theme;
  const groups: { title: string; items: Apparatus[] }[] = data
    ? isCustom
      ? [
          { title: 'Common', items: data.common },
          {
            title: 'Full list',
            items: (data.all ?? []).filter((x) => !x.common && x.name.toLowerCase().includes(query.trim().toLowerCase())),
          },
        ]
      : [
          { title: 'For this theme', items: data.themeItems },
          { title: 'Common', items: data.common },
        ]
    : [];
  const selectedItems = a.selected.map((id) => all.find((x) => x.id === id)).filter((x): x is Apparatus => !!x);

  return (
    <section className="stack" aria-labelledby="stage-h">
      <h1 id="stage-h">4. Apparatus</h1>
      <p>Choose the apparatus you need. Then explain your important choices, for example why a measuring cylinder and not a beaker.</p>
      {data?.note && <p className="notice"><strong>Note:</strong> {data.note}</p>}
      {error && <ErrorState message={error} onRetry={retry} />}
      {isCustom && data && (
        <div>
          <label htmlFor="app-search">Search the full list</label>
          <input id="app-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {groups.map((g) => (
        <fieldset key={g.title} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><h2 style={{ fontSize: '1.05rem' }}>{g.title}</h2></legend>
          <div className="app-grid">
            {g.items.map((item) => {
              const on = a.selected.includes(item.id);
              return (
                <button key={item.id} type="button" className="choice app-tile" aria-pressed={on} onClick={() => toggle(item.id)}>
                  <span className="thumb"><ApparatusThumb a={item} /></span>
                  <span className="name">
                    <span className="check" aria-hidden="true" style={{ width: 22, height: 22 }}>{on ? '✓' : ''}</span>
                    {item.name}
                  </span>
                  {item.measuring && <span className="pill" style={{ alignSelf: 'flex-start' }}>Measures</span>}
                </button>
              );
            })}
            {g.items.length === 0 && <p className="muted">No items match.</p>}
          </div>
        </fieldset>
      ))}

      {selectedItems.length > 0 && (
        <div className="stack">
          <h2>Why did you choose them?</h2>
          {selectedItems.map((item) => {
            const issues = v.issues.filter((i) => i.field === item.id);
            return (
              <div key={item.id} className="answer-card">
                <label htmlFor={`just-${item.id}`}>
                  {item.name}{' '}
                  <span className="hint-text">{item.measuring ? '(needed: this is a measuring instrument)' : '(optional)'}</span>
                </label>
                <textarea id={`just-${item.id}`} rows={2} maxLength={300} value={a.justifications[item.id] ?? ''}
                  onChange={(e) => update('apparatus', { ...a, justifications: { ...a.justifications, [item.id]: e.target.value } })} />
                <BoxResult stage="apparatus" boxId={item.id} text={a.justifications[item.id] ?? ''} />
                {issues.length > 0 && <div style={{ marginTop: 6 }}><IssueList issues={issues} /></div>}
              </div>
            );
          })}
        </div>
      )}
      <SafetyBlocks issues={v.issues} />
      <IssueList issues={v.issues.filter((i) => !i.field)} />
      <StageFooter stage="apparatus" />
    </section>
  );
}
