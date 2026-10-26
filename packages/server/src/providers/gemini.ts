import type { ServerConfig } from '../config.js';
import { geminiConfigured } from '../config.js';
import {
  ProviderError,
  type PlanReview,
  type ProviderHealth,
  type TutorDraft,
  type TutorProvider,
  type TutorTurnContext,
} from './types.js';

/**
 * Gemini is managed by the school / app administrator: a server-side API key
 * (GEMINI_API_KEY in the secret store) and an allowlisted model. Students never
 * connect a Gemini account and never paste keys. A consumer Gemini sign-in does
 * not authorise this app to call the Gemini API.
 *
 * TODO(real Gemini): implement sendTurn() with the official Gemini API client on
 * the server, using the server-owned system prompt and the configured model, with
 * the AbortSignal for timeouts. Pass the result through validateTutorDraft().
 */
export class GeminiAdapter implements TutorProvider {
  readonly id = 'gemini' as const;
  readonly demo = false;

  constructor(private cfg: ServerConfig) {}

  get configured(): boolean {
    return geminiConfigured(this.cfg);
  }

  async sendTurn(_ctx: TutorTurnContext, _signal: AbortSignal): Promise<TutorDraft> {
    throw new ProviderError('Gemini is not configured on this server.', false, 'not_configured');
  }

  async reviewPlan(): Promise<PlanReview> {
    throw new ProviderError('Gemini is not configured on this server.', false, 'not_configured');
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: false,
      demo: false,
      detail: this.configured ? 'Key present, but the real adapter is not enabled in this prototype.' : 'Not configured.',
    };
  }
}
