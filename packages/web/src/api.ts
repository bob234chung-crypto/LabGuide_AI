import type {
  ApparatusGroups,
  AppStage,
  ChatMessage,
  ChatRequest,
  ChecklistItem,
  Diagram,
  Me,
  PlanStage,
  PlanValidation,
  ProviderStatus,
  Scene,
  ReviewedStage,
  Session,
  SessionSummary,
  ShownExample,
} from '@labguide/shared';

/**
 * First-party API only. The browser never talks to Poe or Gemini, never holds a
 * provider credential, and never chooses a provider, model, URL or system prompt.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string; retryable?: boolean; [k: string]: unknown },
  ) {
    super(body.message ?? `Request failed (${status})`);
  }
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)lg_csrf=([^;]+)/)?.[1] ?? '';
}

let ready: Promise<unknown> | null = null;
/** Ensures the anonymous student cookie and CSRF cookie exist before writes. */
export function ensureIdentity(): Promise<unknown> {
  if (!ready || !csrfToken()) ready = fetch('/api/me', { credentials: 'same-origin' });
  return ready;
}

async function request<T>(method: string, url: string, body?: unknown, extra: RequestInit = {}): Promise<T> {
  if (method !== 'GET') await ensureIdentity();
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
      ...(extra.headers as Record<string, string> | undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive: extra.keepalive,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface SessionPayload {
  session: Session;
  validation: PlanValidation;
  checklist: ChecklistItem[];
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  setNickname: (nickname: string) => request<Me>('PUT', '/api/me', { nickname }),
  deleteMyData: () => request<{ deleted: boolean }>('DELETE', '/api/me'),
  providerStatus: () => request<ProviderStatus>('GET', '/api/settings/provider'),
  setSimulateErrors: (simulateErrors: boolean) => request<ProviderStatus>('PUT', '/api/settings/demo', { simulateErrors }),
  disconnectPoe: () => request<ProviderStatus>('POST', '/api/connect/poe/disconnect', {}),

  listSessions: () => request<SessionSummary[]>('GET', '/api/sessions'),
  createSession: () => request<SessionPayload>('POST', '/api/sessions', {}),
  getSession: (id: string) => request<SessionPayload>('GET', `/api/sessions/${encodeURIComponent(id)}`),
  deleteSession: (id: string) => request<{ deleted: boolean }>('DELETE', `/api/sessions/${encodeURIComponent(id)}`),
  saveStage: (id: string, stage: PlanStage, value: unknown, keepalive = false) =>
    request<SessionPayload>('PUT', `/api/sessions/${encodeURIComponent(id)}/stages/${stage}`, { value }, { keepalive }),
  setProgress: (id: string, currentStage: AppStage, diagramMethod?: 'canvas') =>
    request<SessionPayload>('PUT', `/api/sessions/${encodeURIComponent(id)}/progress`, { currentStage, diagramMethod }),
  review: (id: string) => request<{ validation: PlanValidation }>('POST', `/api/sessions/${encodeURIComponent(id)}/review`, {}),
  showExample: (id: string, stage: ReviewedStage) =>
    request<SessionPayload & { example: ShownExample & { stage: ReviewedStage } }>(
      'POST',
      `/api/sessions/${encodeURIComponent(id)}/example`,
      { stage },
    ),
  chat: (id: string, req: ChatRequest & { retry?: boolean }) =>
    request<{ messages: ChatMessage[] }>('POST', `/api/sessions/${encodeURIComponent(id)}/chat`, req),

  apparatus: (theme: string | null) =>
    request<ApparatusGroups>('GET', `/api/apparatus?theme=${encodeURIComponent(theme ?? '')}`),
  diagrams: (id: string) =>
    request<{ working: Diagram | null; versions: Diagram[] }>('GET', `/api/sessions/${encodeURIComponent(id)}/diagrams`),
  saveWorking: (id: string, scene: Scene, keepalive = false) =>
    request<Diagram>('PUT', `/api/sessions/${encodeURIComponent(id)}/diagrams`, { scene }, { keepalive }),
  saveVersion: (id: string, scene: Scene, idempotencyKey: string) =>
    request<Diagram>('POST', `/api/sessions/${encodeURIComponent(id)}/diagrams`, { scene }, {
      headers: { 'idempotency-key': idempotencyKey },
    }),
  checkDiagram: (diagramId: string) =>
    request<{ checks: Diagram['checks']; safetyBlocked: boolean }>('POST', `/api/diagrams/${diagramId}/check`, {}),
  submitDiagram: (diagramId: string) => request<Diagram>('POST', `/api/diagrams/${diagramId}/submit`, {}),
  deleteDiagram: (diagramId: string) => request<{ deleted: boolean }>('DELETE', `/api/diagrams/${diagramId}`),
};
