export type ThemeId = 'photosynthesis' | 'enzyme' | 'dissolving' | 'insulation' | 'custom';

export const PLAN_STAGES = [
  'theme',
  'hypothesis',
  'variables',
  'apparatus',
  'procedure',
  'safety',
  'summary',
] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];
export type AppStage = PlanStage | 'diagram';

export const STAGE_TITLES: Record<PlanStage, string> = {
  theme: 'Theme',
  hypothesis: 'Hypothesis',
  variables: 'Variables',
  apparatus: 'Apparatus',
  procedure: 'Procedure',
  safety: 'Safety review',
  summary: 'Plan summary',
};

export interface TextCard {
  id: string;
  text: string;
}

export interface ThemeAnswer {
  theme: ThemeId | null;
  customTitle: string;
}

export interface VariablesAnswer {
  independent: string;
  dependent: string;
  controlled: TextCard[];
}

export interface ApparatusAnswer {
  selected: string[];
  justifications: Record<string, string>;
}

export interface SafetyAnswer {
  checklist: Record<string, boolean>;
}

export interface Plan {
  theme: ThemeAnswer;
  hypothesis: string;
  variables: VariablesAnswer;
  apparatus: ApparatusAnswer;
  procedure: TextCard[];
  safety: SafetyAnswer;
}

export type StageAnswer =
  | { stage: 'theme'; value: ThemeAnswer }
  | { stage: 'hypothesis'; value: string }
  | { stage: 'variables'; value: VariablesAnswer }
  | { stage: 'apparatus'; value: ApparatusAnswer }
  | { stage: 'procedure'; value: TextCard[] }
  | { stage: 'safety'; value: SafetyAnswer };

export type Severity = 'info' | 'hint' | 'safety_block';

export interface Issue {
  ruleId: string;
  stage: PlanStage;
  severity: Severity;
  /** Plain, short message. Hints are phrased as questions, never as answers. */
  message: string;
  /** For safety blocks: the hazard, then the safe alternative. */
  hazard?: string;
  alternative?: string;
  /** Optional pointer to the field or card the issue is about. */
  field?: string;
  /** True when this must be fixed before the stage counts as complete. */
  required?: boolean;
}

export interface StageValidation {
  stage: PlanStage;
  complete: boolean;
  issues: Issue[];
  /** Specific praise for things done well (used by the tutor templates). */
  praise: string[];
}

export interface PlanValidation {
  stages: Record<PlanStage, StageValidation>;
  safetyBlocks: Issue[];
  /** The highest stage the student may open (all earlier stages complete). */
  furthestUnlocked: PlanStage;
  canGenerateDiagram: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  /** Present only when a hazard rule makes this item necessary. */
  reason?: string;
}

/* ---------- Diagram ---------- */

export type DiagramMethod = 'canvas' | 'photo';

export interface SceneItem {
  id: string;
  apparatusId: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
}

export interface Containment {
  childId: string;
  parentId: string;
}

export interface Connection {
  fromId: string;
  toId: string;
}

export interface LeaderLabel {
  itemId: string;
  text: string;
  anchor: { x: number; y: number };
}

export interface Scene {
  items: SceneItem[];
  containment: Containment[];
  connections: Connection[];
  labels: LeaderLabel[];
}

export interface DiagramCheck {
  ruleId: string;
  severity: Severity;
  passed: boolean;
  message: string;
  hazard?: string;
  alternative?: string;
  itemIds?: string[];
}

export interface Diagram {
  id: string;
  sessionId: string;
  version: number;
  method: DiagramMethod;
  scene: Scene;
  checks: DiagramCheck[];
  status: 'draft' | 'submitted';
  createdAt: string;
}

/* ---------- Apparatus library ---------- */

export interface SnapPoint {
  /** Where a contained child's bottom-centre sits, relative to the container's top-left. */
  x: number;
  y: number;
}

export interface Apparatus {
  id: string;
  name: string;
  /** Inner SVG markup in a viewBox of 0 0 width height. Static, first-party content. */
  svg: string;
  width: number;
  height: number;
  themes: ThemeId[];
  common?: boolean;
  /** Search keywords for the plan/diagram consistency rules. */
  measures?: string[];
  /** Measuring instruments need a justification in Stage 4. */
  measuring?: boolean;
  /** Which apparatus ids may be placed inside this one. */
  canContain?: string[];
  /** Snap point per child apparatus id, with a default for the rest. */
  containSnap?: { default: SnapPoint; [childApparatusId: string]: SnapPoint };
  /** Which apparatus ids this item may be connected to (for tubes). */
  canConnect?: string[];
  heatSource?: boolean;
  flammable?: boolean;
  gasCollector?: boolean;
  eyeProtection?: boolean;
  handProtection?: boolean;
  /** Relationship words used in announcements, e.g. "under" for a lamp target. */
  containVerb?: 'inside' | 'under' | 'on' | 'in';
  note?: string;
}

export interface ThemeInfo {
  id: ThemeId;
  title: string;
  blurb: string;
  note?: string;
}

/* ---------- Tutor ---------- */

export type TutorReplyKind = 'socratic' | 'hint' | 'praise' | 'safety' | 'greeting';

export interface TutorReply {
  id: string;
  role: 'tutor';
  kind: TutorReplyKind;
  text: string;
  questions: string[];
  hintLevel?: 1 | 2 | 3;
  stage: AppStage;
  demo: boolean;
  createdAt: string;
}

export interface StudentMessage {
  id: string;
  role: 'student';
  text: string;
  stage: AppStage;
  createdAt: string;
}

export type ChatMessage = TutorReply | StudentMessage;

export type ChatRequest =
  | { type: 'message'; stage: AppStage; text: string }
  | { type: 'hint'; stage: AppStage }
  | { type: 'check'; stage: AppStage }
  | { type: 'enter'; stage: AppStage };

/* ---------- Session ---------- */

export interface Session {
  id: string;
  ownerId: string;
  title: string;
  plan: Plan;
  currentStage: AppStage;
  diagramMethod: DiagramMethod | null;
  workingDiagram: Diagram | null;
  chat: ChatMessage[];
  hintLevels: Partial<Record<AppStage, number>>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  theme: ThemeId | null;
  currentStage: AppStage;
  updatedAt: string;
  diagramVersions: number;
}

/* ---------- Provider / settings ---------- */

export type ProviderId = 'demo' | 'poe' | 'gemini';

export type ConnectionState =
  | 'demo_simulated'
  | 'demo_not_connected'
  | 'not_configured'
  | 'managed_by_school'
  | 'error';

export interface ProviderStatus {
  activeProvider: ProviderId;
  demoMode: boolean;
  poe: {
    state: ConnectionState;
    label: string;
    configuredOnServer: boolean;
  };
  gemini: {
    state: ConnectionState;
    label: string;
    configuredOnServer: boolean;
  };
  retentionDays: number;
  simulateErrors: boolean;
}

export interface Me {
  studentId: string;
  nickname: string;
}
