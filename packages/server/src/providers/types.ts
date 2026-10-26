import type {
  AppStage,
  ChatMessage,
  ChatRequest,
  DiagramCheck,
  Plan,
  PlanValidation,
  TutorReplyKind,
} from '@labguide/shared';

/** Everything the tutor may see for one turn. Built on the server; never from the client. */
export interface TutorTurnContext {
  request: ChatRequest;
  stage: AppStage;
  plan: Plan;
  validation: PlanValidation;
  diagramChecks: DiagramCheck[];
  hintLevel: 1 | 2 | 3;
  /** Last few messages only (context limit). */
  history: ChatMessage[];
}

/** The raw shape a provider must return. Validated against a server-side schema. */
export interface TutorDraft {
  kind: TutorReplyKind;
  text: string;
  questions: string[];
  hintLevel?: 1 | 2 | 3;
}

export interface PlanReview {
  summary: string;
  questions: string[];
}

export interface ProviderHealth {
  ok: boolean;
  demo: boolean;
  detail: string;
}

export interface TutorProvider {
  readonly id: 'demo' | 'poe' | 'gemini';
  readonly demo: boolean;
  sendTurn(ctx: TutorTurnContext, signal: AbortSignal): Promise<TutorDraft>;
  reviewPlan(ctx: Omit<TutorTurnContext, 'request' | 'hintLevel'>, signal: AbortSignal): Promise<PlanReview>;
  health(): Promise<ProviderHealth>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: 'unavailable' | 'not_configured' | 'invalid_output' | 'timeout' | 'budget',
  ) {
    super(message);
  }
}
