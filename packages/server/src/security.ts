import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ServerConfig } from './config.js';
import type { DataBackend } from './datastore.js';
import type { Store } from './store.js';

export const STUDENT_COOKIE = 'lg_student';
export const CSRF_COOKIE = 'lg_csrf';
export const CSRF_HEADER = 'x-csrf-token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId?: string;
      /** Data scope of this request (see datastore.ts). */
      store?: Store;
    }
  }
}

function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function readStudentCookie(cfg: ServerConfig, raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, mac] = raw.split('.');
  if (!id || !mac) return null;
  return safeEqual(sign(cfg.cookieSecret, id), mac) ? id : null;
}

/**
 * LabGuide's own anonymous auth: an opaque student id in a signed, httpOnly cookie.
 * This is separate from any provider authorisation (Poe/Gemini).
 */
export function studentAuth(cfg: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const store = req.store!;
    let id = readStudentCookie(cfg, req.cookies?.[STUDENT_COOKIE]);
    if (!id || !store.data.students[id]) {
      id = `stu_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const now = new Date().toISOString();
      store.data.students[id] = {
        id,
        nickname: '',
        createdAt: now,
        lastActiveAt: now,
        simulateErrors: false,
        turns: { day: now.slice(0, 10), count: 0 },
      };
      store.save();
      res.cookie(STUDENT_COOKIE, `${id}.${sign(cfg.cookieSecret, id)}`, {
        httpOnly: true,
        sameSite: 'strict',
        secure: cfg.secureCookies,
        path: '/',
        maxAge: cfg.retentionDays * 24 * 60 * 60 * 1000,
      });
    }
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = randomBytes(24).toString('base64url');
      req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: cfg.secureCookies,
        path: '/',
      });
    }
    req.studentId = id;
    const st = store.data.students[id];
    // Hourly granularity is enough for 30-day retention and avoids a write on every read.
    if (Date.now() - Date.parse(st.lastActiveAt) > 60 * 60 * 1000) st.lastActiveAt = new Date().toISOString();
    next();
  };
}

/** Double-submit CSRF check for every state-changing request (cookie auth). */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(String(cookie), String(header))) {
    return res.status(403).json({ error: 'csrf', message: 'Please refresh the page and try again.' });
  }
  next();
}

/**
 * Strict CORS: only the configured first-party origins, no wildcard. On Vercel the request's
 * own host (set by Vercel's edge, so custom domains work) also counts as first-party.
 */
export function strictCors(cfg: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    const sameOrigin = cfg.onVercel && origin === `https://${req.get('host')}`;
    if (origin && !sameOrigin && !cfg.allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', `content-type, ${CSRF_HEADER}, idempotency-key`);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/**
 * Rate limiter keyed by IP, student or chat. The backend decides where the counters live:
 * in memory for one process, in Redis when several serverless instances share the limits.
 */
export function rateLimit(
  backend: DataBackend,
  opts: { capacity: number; refillPerSec: number; key: (req: Request) => string },
) {
  return (req: Request, res: Response, next: NextFunction) => {
    backend.take(opts.key(req), opts.capacity, opts.refillPerSec).then((ok) => {
      if (ok) return next();
      res.setHeader('Retry-After', '5');
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please wait a moment.' });
    }, next);
  };
}

export function requireAdmin(cfg: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!cfg.adminToken || !token || !safeEqual(token, cfg.adminToken)) {
      return res.status(404).json({ error: 'not_found' });
    }
    next();
  };
}
