import { createHash, randomBytes } from 'node:crypto';
import type { ServerConfig } from '../config.js';
import { poeConfigured } from '../config.js';
import {
  ProviderError,
  type PlanReview,
  type ProviderHealth,
  type TutorDraft,
  type TutorProvider,
  type TutorTurnContext,
} from './types.js';

/** PKCE (RFC 7636) helpers. S256 only. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Real Poe integration plugs in here.
 *
 * TODO(real Poe):
 *  1. Fill in POE_AUTHORIZE_URL / POE_TOKEN_URL / POE_REVOKE_URL from Poe's official
 *     OAuth documentation once the app is registered.
 *  2. buildAuthorizeUrl(): Authorization Code + PKCE (S256), exact registered redirect URI, state.
 *  3. exchangeCode(): server-side POST to the token endpoint with code + code_verifier.
 *     Store the result only via Vault.encrypt(); never log it or send it to the browser.
 *  4. sendTurn(): decrypt the student's token server-side, call the allowlisted model with
 *     the server-owned system prompt, then pass the output through validateTutorDraft().
 *  5. revoke(): call the revocation endpoint, then delete the encrypted record.
 *
 * In this prototype none of these send a request. They throw "not_configured" unless
 * credentials, app registration and callback configuration exist on the server, and
 * even then the network calls are intentionally left unimplemented.
 */
export class PoeAdapter implements TutorProvider {
  readonly id = 'poe' as const;
  readonly demo = false;

  constructor(private cfg: ServerConfig) {}

  get configured(): boolean {
    return poeConfigured(this.cfg);
  }

  buildAuthorizeUrl(_state: string, _codeChallenge: string): string {
    throw new ProviderError('Poe is not configured on this server.', false, 'not_configured');
  }

  async exchangeCode(_code: string, _codeVerifier: string): Promise<{ accessToken: string; refreshToken?: string }> {
    throw new ProviderError('Poe is not configured on this server.', false, 'not_configured');
  }

  async revoke(_accessToken: string): Promise<void> {
    throw new ProviderError('Poe is not configured on this server.', false, 'not_configured');
  }

  async sendTurn(_ctx: TutorTurnContext, _signal: AbortSignal): Promise<TutorDraft> {
    throw new ProviderError('Poe is not configured on this server.', false, 'not_configured');
  }

  async reviewPlan(): Promise<PlanReview> {
    throw new ProviderError('Poe is not configured on this server.', false, 'not_configured');
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: false,
      demo: false,
      detail: this.configured ? 'Configured, but the real adapter is not enabled in this prototype.' : 'Not configured.',
    };
  }
}
