import {
  APPARATUS,
  CONTROL_MAX,
  isThemeId,
  type ApparatusAnswer,
  type AppStage,
  type PlanStage,
  type SafetyAnswer,
  type TextCard,
  type ThemeAnswer,
  type VariablesAnswer,
} from '@labguide/shared';
const APP_IDS = new Set(APPARATUS.map((a) => a.id));
export const APP_STAGES: AppStage[] = [
  'theme',
  'hypothesis',
  'variables',
  'apparatus',
  'procedure',
  'safety',
  'summary',
  'diagram',
];

export class BadInput extends Error {}

const str = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
    .slice(0, max);

function cards(v: unknown, maxCards: number, maxLen: number): TextCard[] {
  if (!Array.isArray(v)) throw new BadInput('expected a list');
  return v.slice(0, maxCards).map((c, i) => ({
    id: str((c as TextCard)?.id, 40) || `card_${i}`,
    text: str((c as TextCard)?.text, maxLen),
  }));
}

/** Validates untrusted stage answers against the server-side schema. */
export function sanitizeStage(stage: string, value: unknown): { stage: PlanStage; value: unknown } {
  switch (stage) {
    case 'theme': {
      const v = (value ?? {}) as ThemeAnswer;
      const theme = typeof v.theme === 'string' && isThemeId(v.theme) ? v.theme : null;
      return { stage, value: { theme, customTitle: str(v.customTitle, 80) } satisfies ThemeAnswer };
    }
    case 'hypothesis':
      return { stage, value: str(value, 400) };
    case 'variables': {
      const v = (value ?? {}) as VariablesAnswer;
      return {
        stage,
        value: {
          independent: str(v.independent, 160),
          dependent: str(v.dependent, 160),
          controlled: cards(v.controlled ?? [], CONTROL_MAX, 160),
        } satisfies VariablesAnswer,
      };
    }
    case 'apparatus': {
      const v = (value ?? {}) as ApparatusAnswer;
      const selected = (Array.isArray(v.selected) ? v.selected : []).map(String).filter((id) => APP_IDS.has(id));
      const justifications: Record<string, string> = {};
      for (const [k, j] of Object.entries(v.justifications ?? {})) {
        if (APP_IDS.has(k)) justifications[k] = str(j, 300);
      }
      return { stage, value: { selected: [...new Set(selected)].slice(0, 40), justifications } };
    }
    case 'procedure':
      return { stage, value: cards(value, 20, 300) };
    case 'safety': {
      const v = (value ?? {}) as SafetyAnswer;
      const checklist: Record<string, boolean> = {};
      for (const [k, b] of Object.entries(v.checklist ?? {}).slice(0, 20)) checklist[str(k, 40)] = b === true;
      return { stage, value: { checklist } satisfies SafetyAnswer };
    }
    default:
      throw new BadInput('unknown stage');
  }
}
