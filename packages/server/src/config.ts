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
    allowlist: readonly ('demo' | 'poe' | 'gemini')[];
    active: 'demo' | 'poe' | 'gemini';
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
    timeoutMs: number;
    maxRetries: number;
  };
}

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
      allowlist: ['demo', 'poe', 'gemini'],
      active: (env('LABGUIDE_PROVIDER') as 'demo' | 'poe' | 'gemini' | null) ?? 'demo',
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
      timeoutMs: 15000,
      maxRetries: 1,
    },
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
