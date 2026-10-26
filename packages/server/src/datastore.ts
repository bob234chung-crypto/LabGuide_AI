import { randomUUID } from 'node:crypto';
import type { Diagram, Session } from '@labguide/shared';
import type { NextFunction, Request, Response } from 'express';
import type { KvClient, KvCommand } from './kv.js';
import { log } from './logger.js';
import { Store, emptyDb, type DbShape, type PendingOAuthRecord, type ProviderCredentialRecord, type StudentRecord } from './store.js';

/**
 * The data a single API request works on. Handlers read and mutate `store.data`
 * synchronously; `close()` persists the changes before the response is sent.
 */
export interface Scope {
  store: Store;
  close(): Promise<void>;
  abandon(): Promise<void>;
}

export interface DataBackend {
  readonly kind: 'file' | 'redis';
  open(studentId: string | null): Promise<Scope>;
  /** Consumes one request from the limiter `key`; false when the limit is reached. */
  take(key: string, capacity: number, refillPerSec: number): Promise<boolean>;
}

/** Another request for the same student held the lock for too long. */
export class BusyError extends Error {}

/** Single-process backend: the JSON file store plus in-memory token buckets (local dev). */
export class FileBackend implements DataBackend {
  readonly kind = 'file';
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(readonly store: Store) {}

  async open(): Promise<Scope> {
    return { store: this.store, close: async () => {}, abandon: async () => {} };
  }

  async take(key: string, capacity: number, refillPerSec: number): Promise<boolean> {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: capacity, updated: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 1000) * refillPerSec);
    b.updated = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10000) this.buckets.clear();
    return ok;
  }
}

interface StudentDoc {
  v: 1;
  student: StudentRecord;
  sessions: Session[];
  diagrams: Diagram[];
  idempotency: DbShape['idempotency'];
  credential: ProviderCredentialRecord | null;
  oauth: Record<string, PendingOAuthRecord>;
}

const PREFIX = 'lg:';
const studentKey = (id: string) => `${PREFIX}student:${id}`;
const lockKey = (id: string) => `${PREFIX}lock:${id}`;
const PROVIDER_CONFIG_KEY = `${PREFIX}provider-config`;

function docFor(data: DbShape, id: string): StudentDoc {
  const sessions = Object.values(data.sessions).filter((s) => s.ownerId === id);
  const sessionIds = new Set(sessions.map((s) => s.id));
  return {
    v: 1,
    student: data.students[id],
    sessions,
    diagrams: Object.values(data.diagrams).filter((d) => sessionIds.has(d.sessionId)),
    idempotency: Object.fromEntries(Object.entries(data.idempotency).filter(([k]) => k.startsWith(`${id}:`))),
    credential: data.credentials[id] ?? null,
    oauth: Object.fromEntries(Object.entries(data.oauth).filter(([, p]) => p.studentId === id)),
  };
}

function mergeDoc(data: DbShape, doc: StudentDoc) {
  data.students[doc.student.id] = doc.student;
  for (const s of doc.sessions) data.sessions[s.id] = s;
  for (const d of doc.diagrams) data.diagrams[d.id] = d;
  Object.assign(data.idempotency, doc.idempotency);
  if (doc.credential) data.credentials[doc.student.id] = doc.credential;
  Object.assign(data.oauth, doc.oauth);
}

/**
 * Upstash Redis / Vercel KV backend for serverless deployments. Each student's data is one
 * JSON document whose TTL is the retention period, refreshed on every write, so Redis deletes
 * it 30 days after the last activity. Requests for the same student are serialised with a
 * short lock so concurrent instances never overwrite each other's changes.
 */
export class RedisBackend implements DataBackend {
  readonly kind = 'redis';
  private ttlSec: number;
  private lockTtlMs: number;
  private lockWaitMs: number;

  constructor(
    private kv: KvClient,
    private opts: { retentionDays: number; lockTtlMs?: number; lockWaitMs?: number },
  ) {
    this.ttlSec = opts.retentionDays * 24 * 60 * 60;
    this.lockTtlMs = opts.lockTtlMs ?? 30_000;
    this.lockWaitMs = opts.lockWaitMs ?? 10_000;
  }

  private async lock(id: string): Promise<() => KvCommand[]> {
    const token = randomUUID();
    const started = Date.now();
    for (let delay = 20; ; delay = Math.min(delay * 2, 250)) {
      const [ok] = await this.kv.exec([['SET', lockKey(id), token, 'PX', this.lockTtlMs, 'NX']]);
      if (ok === 'OK') {
        const acquired = Date.now();
        // Only delete the lock while it is certainly still ours (it cannot have expired yet).
        return () => (Date.now() - acquired < this.lockTtlMs - 2000 ? [['DEL', lockKey(id)]] : []);
      }
      if (Date.now() - started > this.lockWaitMs) throw new BusyError('student_busy');
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  async open(studentId: string | null): Promise<Scope> {
    const unlock = studentId ? await this.lock(studentId) : () => [];
    try {
      const reads: KvCommand[] = [['GET', PROVIDER_CONFIG_KEY]];
      if (studentId) reads.push(['GET', studentKey(studentId)]);
      const [cfgRaw, docRaw] = (await this.kv.exec(reads)) as (string | null)[];
      const data = emptyDb();
      if (cfgRaw) data.providerConfig = JSON.parse(cfgRaw);
      if (docRaw) mergeDoc(data, JSON.parse(docRaw) as StudentDoc);
      const store = new Store(null, data);
      store.purgeExpired(this.opts.retentionDays);

      const cfgBefore = JSON.stringify(data.providerConfig);
      // Compared with what was read (not the purged view) so purged records are written back.
      const before = new Map<string, string>(studentId && docRaw ? [[studentId, docRaw]] : []);

      return {
        store,
        close: async () => {
          const writes: KvCommand[] = [];
          const cfgNow = JSON.stringify(store.data.providerConfig);
          if (cfgNow !== cfgBefore) writes.push(['SET', PROVIDER_CONFIG_KEY, cfgNow]);
          for (const id of new Set([...before.keys(), ...Object.keys(store.data.students)])) {
            if (!store.data.students[id]) {
              writes.push(['DEL', studentKey(id)]);
              continue;
            }
            const doc = JSON.stringify(docFor(store.data, id));
            if (doc !== before.get(id)) writes.push(['SET', studentKey(id), doc, 'EX', this.ttlSec]);
          }
          writes.push(...unlock());
          if (writes.length) await this.kv.exec(writes);
        },
        abandon: async () => {
          const cmds = unlock();
          if (cmds.length) await this.kv.exec(cmds).catch(() => log.warn('kv_unlock_failed'));
        },
      };
    } catch (err) {
      const cmds = unlock();
      if (cmds.length) await this.kv.exec(cmds).catch(() => undefined);
      throw err;
    }
  }

  /** Fixed-window counter shared by all instances (same average rate as the token bucket). */
  async take(key: string, capacity: number, refillPerSec: number): Promise<boolean> {
    const windowMs = Math.max(1000, Math.ceil((capacity / refillPerSec) * 1000));
    const k = `${PREFIX}rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const [, count] = await this.kv.exec([
      ['SET', k, 0, 'PX', windowMs * 2, 'NX'],
      ['INCR', k],
    ]);
    return Number(count) <= capacity;
  }
}

/**
 * Opens the data scope for the request and defers `res.end` until the scope's changes are
 * saved, so a response is only sent once its data is durable (serverless instances can be
 * frozen right after the response).
 */
export function requestScope(backend: DataBackend, studentIdFromRequest: (req: Request) => string | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    backend.open(studentIdFromRequest(req)).then(
      (scope) => {
        req.store = scope.store;
        const end = res.end.bind(res) as (...args: unknown[]) => Response;
        let ended = false;
        res.on('close', () => {
          if (!ended) void scope.abandon();
        });
        (res as unknown as { end: (...args: unknown[]) => Response }).end = (...args: unknown[]) => {
          if (ended) return end(...args);
          ended = true;
          scope.close().then(
            () => end(...args),
            (err) => {
              log.warn('store_write_failed', { name: (err as Error)?.name });
              void scope.abandon();
              if (res.headersSent) return end(...args);
              for (const h of ['content-length', 'location', 'set-cookie', 'etag']) res.removeHeader(h);
              res.statusCode = 503;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              end(JSON.stringify({ error: 'storage_unavailable', retryable: true, message: 'We could not save that. Please try again.' }));
            },
          );
          return res;
        };
        next();
      },
      (err) => next(err),
    );
  };
}
