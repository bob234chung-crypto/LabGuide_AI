import fs from 'node:fs';
import path from 'node:path';
import type { Diagram, Session } from '@labguide/shared';

export interface StudentRecord {
  id: string;
  nickname: string;
  createdAt: string;
  lastActiveAt: string;
  simulateErrors: boolean;
  turns: { day: string; count: number };
}

export interface ProviderCredentialRecord {
  studentId: string;
  provider: 'poe';
  /** AES-256-GCM ciphertext from the vault. Never returned by any endpoint. */
  ciphertext: string;
  demo: boolean;
  createdAt: string;
}

/** A pending Poe OAuth attempt, keyed by its `state` value. */
export interface PendingOAuthRecord {
  studentId: string;
  verifier: string;
  expires: number;
}

export interface DbShape {
  students: Record<string, StudentRecord>;
  sessions: Record<string, Session>;
  diagrams: Record<string, Diagram>;
  /** Keys are `${studentId}:${sessionId}:${clientKey}`. */
  idempotency: Record<string, { diagramId: string; createdAt: string }>;
  credentials: Record<string, ProviderCredentialRecord>;
  oauth: Record<string, PendingOAuthRecord>;
  /** Set by the admin API. While `updatedAt` is null the server config (env) decides. */
  providerConfig: { active: 'demo' | 'poe' | 'gemini' | 'deepseek'; updatedAt: string | null };
}

export function emptyDb(): DbShape {
  return {
    students: {},
    sessions: {},
    diagrams: {},
    idempotency: {},
    credentials: {},
    oauth: {},
    providerConfig: { active: 'demo', updatedAt: null },
  };
}

/** Small JSON-file store with atomic, debounced writes. Swap for SQLite/Postgres later. */
export class Store {
  data: DbShape;
  private file: string | null;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string | null, data?: DbShape) {
    this.file = dataDir ? path.join(dataDir, 'db.json') : null;
    this.data = data ?? emptyDb();
    if (this.file && fs.existsSync(this.file)) {
      try {
        this.data = { ...emptyDb(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      } catch {
        fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      }
    }
  }

  save(): void {
    if (!this.file) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush(): void {
    if (!this.file) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  /** Delete sessions and diagrams 30 days (configurable) after last activity. */
  purgeExpired(retentionDays: number, now = Date.now()): number {
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const [id, s] of Object.entries(this.data.sessions)) {
      if (Date.parse(s.updatedAt) < cutoff) {
        this.deleteSession(id);
        removed++;
      }
    }
    for (const [id, st] of Object.entries(this.data.students)) {
      const hasSessions = Object.values(this.data.sessions).some((s) => s.ownerId === id);
      if (!hasSessions && Date.parse(st.lastActiveAt) < cutoff) {
        delete this.data.students[id];
        delete this.data.credentials[id];
      }
    }
    for (const [state, p] of Object.entries(this.data.oauth)) {
      if (p.expires < now) delete this.data.oauth[state];
    }
    if (removed) this.save();
    return removed;
  }

  deleteSession(id: string): void {
    delete this.data.sessions[id];
    for (const [did, d] of Object.entries(this.data.diagrams)) {
      if (d.sessionId === id) delete this.data.diagrams[did];
    }
    for (const [k, v] of Object.entries(this.data.idempotency)) {
      if (!this.data.diagrams[v.diagramId]) delete this.data.idempotency[k];
    }
  }

  deleteStudent(studentId: string): void {
    for (const s of Object.values(this.data.sessions)) {
      if (s.ownerId === studentId) this.deleteSession(s.id);
    }
    delete this.data.students[studentId];
    delete this.data.credentials[studentId];
    for (const [state, p] of Object.entries(this.data.oauth)) {
      if (p.studentId === studentId) delete this.data.oauth[state];
    }
    this.save();
  }
}
