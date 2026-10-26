import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * All configuration is read from server-side environment variables.
 * Nothing here is ever sent to the browser except the derived, non-secret status.
 */
export interface ServerConfig {
  port: number;
  dataDir: string;
  /** Exact browser origins allowed by CORS (comma-separated in the env var). No wildcards. */
  allowedOrigins: string[];
  /** Set when served over HTTPS (behind a TLS-terminating proxy) so cookies get `Secure`. */
  secureCookies: boolean;
  /** Running on Vercel (or NODE_ENV=production): secrets and persistent storage are required. */
  production: boolean;
  onVercel: boolean;
  cookieSecret: string;
  vaultKey: string;
  /** Upstash Redis / Vercel KV REST credentials. When null, the JSON file store is used. */
  kv: { url: string; token: string } | null;
  adminToken: string | null;
  retentionDays: number;
  dailyTurnBudget: number;
  provider: {
    /** Allowlisted provider ids. The client can never choose one. */
    allowlist: readonly ProviderName[];
    active: ProviderName;
    poe: {
      clientId: string | null;
      clientSecret: string | null;
      /** Exact registered redirect URI, e.g. https://labguide.example/api/connect/poe/callback */
      redirectUri: string | null;
      model: string;
    };
    gemini: {
      apiKey: string | null;
      model: string;
    };
    deepseek: {
      apiKey: string | null;
      /** Fixed, not read from the environment: only allowlisted endpoints and models are called. */
      baseUrl: typeof DEEPSEEK_BASE_URL;
      model: typeof DEEPSEEK_MODEL;
      /** Output token limits per call. */
      maxTokensTurn: number;
      maxTokensReview: number;
      /** Conservative USD prices per million tokens, used to estimate spend before and after each call. */
      priceInPerM: number;
      priceOutPerM: number;
    };
    timeoutMs: number;
    maxRetries: number;
  };
  /** Total spend on paid AI calls per day (Hong Kong date), shared by every student. */
  dailySpendCapUsd: number;
}

export type ProviderName = 'demo' | 'poe' | 'gemini' | 'deepseek';
export const PROVIDER_ALLOWLIST: readonly ProviderName[] = ['demo', 'poe', 'gemini', 'deepseek'];
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com' as const;
export const DEEPSEEK_MODEL = 'deepseek-chat' as const;

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

const DEV_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787';

function origins(production: boolean): string[] {
  const list = (env('LABGUIDE_ALLOWED_ORIGINS') ?? (production ? '' : DEV_ORIGINS)).split(',');
  list.push(env('LABGUIDE_PUBLIC_ORIGIN') ?? '');
  // Hostnames Vercel assigns to this deployment, its branch and the production domain.
  for (const name of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const host = env(name);
    if (host) list.push(`https://${host}`);
  }
  return [...new Set(list.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean))];
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const onVercel = !!env('VERCEL');
  const production = onVercel || env('NODE_ENV') === 'production';
  const kvUrl = env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL');
  const kvToken = env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN');
  const deepseekKey = env('DEEPSEEK_API_KEY');
  const requested = env('LABGUIDE_PROVIDER') as ProviderName | null;
  const active: ProviderName =
    requested && PROVIDER_ALLOWLIST.includes(requested) ? requested : deepseekKey ? 'deepseek' : 'demo';
  const capEnv = Number(env('LABGUIDE_DAILY_SPEND_CAP_USD') ?? 1);
  const base: ServerConfig = {
    port: Number(env('PORT') ?? 8787),
    dataDir: env('LABGUIDE_DATA_DIR') ?? path.resolve(here, '../data'),
    allowedOrigins: origins(production),
    secureCookies: onVercel || env('LABGUIDE_SECURE_COOKIES') === 'true',
    production,
    onVercel,
    // Random per-boot fallbacks are for local development only; production refuses to start
    // without real values (see configErrors).
    cookieSecret: env('LABGUIDE_COOKIE_SECRET') ?? (production ? '' : randomBytes(32).toString('hex')),
    vaultKey: env('LABGUIDE_VAULT_KEY') ?? (production ? '' : randomBytes(32).toString('hex')),
    kv: kvUrl && kvToken ? { url: kvUrl, token: kvToken } : null,
    adminToken: env('LABGUIDE_ADMIN_TOKEN'),
    retentionDays: 30,
    dailyTurnBudget: Number(env('LABGUIDE_DAILY_TURN_BUDGET') ?? 300),
    provider: {
      allowlist: PROVIDER_ALLOWLIST,
      active,
      poe: {
        clientId: env('POE_CLIENT_ID'),
        clientSecret: env('POE_CLIENT_SECRET'),
        redirectUri: env('POE_REDIRECT_URI'),
        model: env('POE_MODEL') ?? 'configured-on-server',
      },
      gemini: {
        apiKey: env('GEMINI_API_KEY'),
        model: env('GEMINI_MODEL') ?? 'configured-on-server',
      },
      deepseek: {
        apiKey: deepseekKey,
        baseUrl: DEEPSEEK_BASE_URL,
        model: DEEPSEEK_MODEL,
        maxTokensTurn: 350,
        maxTokensReview: 250,
        // Above DeepSeek's published deepseek-chat prices (cache-miss input, output), so the cap errs on the safe side.
        priceInPerM: 0.6,
        priceOutPerM: 2.0,
      },
      // Two attempts must finish well inside the 30 s function limit and the 30 s per-student lock.
      timeoutMs: 10000,
      maxRetries: 1,
    },
    // Capped at US$1 even if the variable is set higher; a lower value can be set to test the fallback.
    dailySpendCapUsd: Number.isFinite(capEnv) && capEnv >= 0 ? Math.min(capEnv, 1) : 1,
  };
  return { ...base, ...overrides };
}

/** Problems that must stop the server from handling requests. Names only, never values. */
export function configErrors(c: ServerConfig): string[] {
  const errors: string[] = [];
  if (!c.production) return errors;
  if (c.cookieSecret.length < 32) errors.push('LABGUIDE_COOKIE_SECRET is missing or shorter than 32 characters.');
  if (c.vaultKey.length < 32) errors.push('LABGUIDE_VAULT_KEY is missing or shorter than 32 characters.');
  if (c.onVercel && !c.kv) {
    errors.push('No Redis store is connected: add Upstash Redis from the Vercel Marketplace (sets KV_REST_API_URL and KV_REST_API_TOKEN).');
  }
  return errors;
}

export function poeConfigured(c: ServerConfig): boolean {
  return !!(c.provider.poe.clientId && c.provider.poe.clientSecret && c.provider.poe.redirectUri);
}

export function geminiConfigured(c: ServerConfig): boolean {
  return !!c.provider.gemini.apiKey;
}

export function deepseekConfigured(c: ServerConfig): boolean {
  return !!c.provider.deepseek.apiKey;
}
