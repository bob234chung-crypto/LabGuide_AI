/**
 * Minimal Redis client surface used by the Redis data backend. Only GET, SET (EX/PX/NX),
 * DEL and INCR are used, so it works with Upstash / Vercel KV over their REST API.
 */
export type KvCommand = (string | number)[];

export interface KvClient {
  /** Runs the commands in order (one round trip) and returns each result. */
  exec(commands: KvCommand[]): Promise<unknown[]>;
}

export class KvError extends Error {}

/** Upstash Redis REST API (`KV_REST_API_*` or `UPSTASH_REDIS_REST_*`). */
export class UpstashRestKv implements KvClient {
  constructor(
    private url: string,
    private token: string,
    private timeoutMs = 5000,
  ) {
    this.url = url.replace(/\/+$/, '');
  }

  async exec(commands: KvCommand[]): Promise<unknown[]> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(commands.map((c) => c.map(String))),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new KvError('kv_unreachable');
    }
    if (!res.ok) throw new KvError(`kv_http_${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string }[];
    if (!Array.isArray(body) || body.length !== commands.length) throw new KvError('kv_bad_response');
    return body.map((r) => {
      if (r.error) throw new KvError('kv_command_failed');
      return r.result ?? null;
    });
  }
}

/** In-process implementation of the same commands, for tests and local simulation. */
export class MemoryKv implements KvClient {
  private map = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private clock: () => number = Date.now) {}

  private live(key: string) {
    const e = this.map.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= this.clock()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  /** Remaining time to live in ms (-1 = no expiry, -2 = missing), like PTTL. */
  pttl(key: string): number {
    const e = this.live(key);
    if (!e) return -2;
    return e.expiresAt === null ? -1 : e.expiresAt - this.clock();
  }

  keys(): string[] {
    return [...this.map.keys()].filter((k) => this.live(k));
  }

  async exec(commands: KvCommand[]): Promise<unknown[]> {
    return commands.map((c) => this.run(c.map(String)));
  }

  private run([cmd, key, ...rest]: string[]): unknown {
    switch (cmd.toUpperCase()) {
      case 'GET':
        return this.live(key)?.value ?? null;
      case 'SET': {
        const [value, ...opts] = rest;
        let expiresAt: number | null = null;
        let nx = false;
        for (let i = 0; i < opts.length; i++) {
          const o = opts[i].toUpperCase();
          if (o === 'NX') nx = true;
          else if (o === 'EX') expiresAt = this.clock() + Number(opts[++i]) * 1000;
          else if (o === 'PX') expiresAt = this.clock() + Number(opts[++i]);
          else throw new KvError(`unsupported SET option ${o}`);
        }
        if (nx && this.live(key)) return null;
        this.map.set(key, { value, expiresAt });
        return 'OK';
      }
      case 'DEL':
        return [key, ...rest].reduce((n, k) => n + (this.live(k) && this.map.delete(k) ? 1 : 0), 0);
      case 'INCR': {
        const e = this.live(key);
        const next = Number(e?.value ?? 0) + 1;
        this.map.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
        return next;
      }
      default:
        throw new KvError(`unsupported command ${cmd}`);
    }
  }
}
