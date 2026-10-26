import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { safetyChecklist, type Plan } from '@labguide/shared';
import { createApp } from '../src/app.js';
import { configErrors, loadConfig } from '../src/config.js';
import { RedisBackend } from '../src/datastore.js';
import { MemoryKv, UpstashRestKv } from '../src/kv.js';

process.env.NODE_ENV = 'test';

const SECRETS = { cookieSecret: 'c'.repeat(64), vaultKey: 'v'.repeat(64), adminToken: 'admin-test-token' };

/** Two app instances sharing one Redis, like two serverless instances. */
function cluster(kv = new MemoryKv()) {
  const make = () => createApp({ backend: new RedisBackend(kv, { retentionDays: 30 }), config: SECRETS }).app;
  return { kv, a: make(), b: make() };
}

/** A browser-like client with a cookie jar that can talk to any instance. */
function browser() {
  const jar = new Map<string, string>();
  const keep = (res: request.Response) => {
    for (const c of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair] = c.split(';');
      const [name, ...rest] = pair.split('=');
      jar.set(name, rest.join('='));
    }
    return res;
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrf = () => jar.get('lg_csrf') ?? '';
  return {
    jar,
    get: async (app: Express, url: string) => keep(await request(app).get(url).set('Cookie', cookie())),
    send: async (app: Express, method: 'post' | 'put' | 'delete', url: string, body: object = {}, headers: Record<string, string> = {}) =>
      keep(await request(app)[method](url).set('Cookie', cookie()).set('x-csrf-token', csrf()).set(headers).send(body)),
  };
}

describe('Redis storage (serverless)', () => {
  it('keeps a student and their work across instances, with a 30-day TTL', async () => {
    const { kv, a, b } = cluster();
    const u = browser();
    const me = await u.get(a, '/api/me');
    const created = await u.send(b, 'post', '/api/sessions');
    expect(created.status).toBe(201);
    await u.send(a, 'put', `/api/sessions/${created.body.session.id}/stages/hypothesis`, { value: 'If the lamp is closer, more bubbles.' });
    const got = await u.get(b, `/api/sessions/${created.body.session.id}`);
    expect(got.body.session.plan.hypothesis).toBe('If the lamp is closer, more bubbles.');
    expect((await u.get(a, '/api/me')).body.studentId).toBe(me.body.studentId);

    const key = `lg:student:${me.body.studentId}`;
    const ttl = kv.pttl(key);
    expect(ttl).toBeGreaterThan(29.9 * 864e5);
    expect(ttl).toBeLessThanOrEqual(30 * 864e5);
    expect(kv.keys().filter((k) => k.startsWith('lg:lock:'))).toHaveLength(0);
  });

  it('expires the whole record when the TTL runs out', async () => {
    let now = Date.now();
    const kv = new MemoryKv(() => now);
    const { a } = cluster(kv);
    const u = browser();
    const me = await u.get(a, '/api/me');
    await u.send(a, 'post', '/api/sessions');
    now += 31 * 864e5;
    expect(kv.keys().filter((k) => k.startsWith('lg:student:'))).toHaveLength(0);
    const again = await u.get(a, '/api/me');
    expect(again.body.studentId).not.toBe(me.body.studentId);
  });

  it('purges a session untouched for 30 days and writes the purge back', async () => {
    const { kv, a } = cluster();
    const u = browser();
    const me = await u.get(a, '/api/me');
    const created = await u.send(a, 'post', '/api/sessions');
    const key = `lg:student:${me.body.studentId}`;
    const [raw] = (await kv.exec([['GET', key]])) as string[];
    const doc = JSON.parse(raw);
    doc.sessions[0].updatedAt = new Date(Date.now() - 31 * 864e5).toISOString();
    await kv.exec([['SET', key, JSON.stringify(doc), 'EX', 1000]]);
    expect((await u.get(a, '/api/sessions')).body).toHaveLength(0);
    const [after] = (await kv.exec([['GET', key]])) as string[];
    expect(JSON.parse(after).sessions).toHaveLength(0);
    expect(created.status).toBe(201);
  });

  it('serialises concurrent writes from different instances', async () => {
    const { a, b } = cluster();
    const u = browser();
    await u.get(a, '/api/me');
    await Promise.all([0, 1, 2, 3, 4, 5].map((i) => u.send(i % 2 ? a : b, 'post', '/api/sessions')));
    expect((await u.get(a, '/api/sessions')).body).toHaveLength(6);
  });

  it('completes the simulated Poe OAuth flow across instances and rejects a forged state', async () => {
    const { a, b } = cluster();
    const u = browser();
    await u.get(a, '/api/me');
    const start = await u.get(a, '/api/connect/poe/start?consent=yes');
    expect(start.status).toBe(303);
    const cb = await u.get(b, start.headers.location);
    expect(cb.headers.location).toBe('/settings?poe=demo_connected');
    const replay = await u.get(a, start.headers.location);
    expect(replay.headers.location).toBe('/settings?poe=state_mismatch');
    const forged = await u.get(b, '/api/connect/poe/callback?state=__proto__&code=x&demo=1');
    expect(forged.headers.location).toBe('/settings?poe=state_mismatch');
    const status = await u.get(b, '/api/settings/provider');
    expect(status.body.poe.state).toBe('demo_simulated');
    expect(status.body.demoMode).toBe(true);
  });

  it('shares rate limits across instances', async () => {
    const { a, b } = cluster();
    const u = browser();
    await u.get(a, '/api/me');
    const { body } = await u.send(a, 'post', '/api/sessions');
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await u.send(i % 2 ? a : b, 'post', `/api/sessions/${body.session.id}/chat`, { type: 'check', stage: 'theme' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it('keeps diagram saves idempotent across instances', async () => {
    const { a, b } = cluster();
    const u = browser();
    await u.get(a, '/api/me');
    const { body } = await u.send(a, 'post', '/api/sessions');
    const id = body.session.id;
    const stages: [string, unknown][] = [
      ['theme', { theme: 'photosynthesis', customTitle: '' }],
      ['hypothesis', 'If the lamp is closer to the pondweed, then more bubbles will be produced per minute.'],
      ['variables', { independent: 'Distance of the lamp', dependent: 'Number of bubbles per minute', controlled: [{ id: 'a', text: 'Temperature of water' }, { id: 'b', text: 'Type of pondweed' }] }],
      ['apparatus', { selected: ['pondweed', 'boiling-tube', 'lamp', 'metre-rule', 'stopwatch', 'safety-goggles'], justifications: { 'metre-rule': 'To measure the distance precisely in cm.', stopwatch: 'To time exactly one minute for each count.' } }],
      ['procedure', ['Put the pondweed in a boiling tube of water.', 'Place the lamp 10 cm away using the metre rule.', 'Count and record the bubbles for one minute.', 'Repeat three times at each distance.'].map((text, i) => ({ id: `s${i}`, text }))],
    ];
    for (const [stage, value] of stages) await u.send(a, 'put', `/api/sessions/${id}/stages/${stage}`, { value });
    const plan = (await u.get(b, `/api/sessions/${id}`)).body.session.plan as Plan;
    const checklist = Object.fromEntries(safetyChecklist(plan).map((item) => [item.id, true]));
    const ready = await u.send(b, 'put', `/api/sessions/${id}/stages/safety`, { value: { checklist } });
    expect(ready.body.validation.canGenerateDiagram).toBe(true);

    const v1 = await u.send(a, 'post', `/api/sessions/${id}/diagrams`, {}, { 'Idempotency-Key': 'k1' });
    const again = await u.send(b, 'post', `/api/sessions/${id}/diagrams`, {}, { 'Idempotency-Key': 'k1' });
    expect(v1.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(v1.body.id);
    expect((await u.get(a, `/api/sessions/${id}/diagrams`)).body.versions).toHaveLength(1);
  });

  it('deletes the Redis record when a student deletes their data', async () => {
    const { kv, a, b } = cluster();
    const u = browser();
    const me = await u.get(a, '/api/me');
    await u.send(a, 'post', '/api/sessions');
    expect((await u.send(b, 'delete', '/api/me')).body.deleted).toBe(true);
    expect(kv.keys()).not.toContain(`lg:student:${me.body.studentId}`);
  });

  it('stores admin provider config in Redis for every instance', async () => {
    const { a, b } = cluster();
    const auth = { Authorization: 'Bearer admin-test-token' };
    const put = await request(a).put('/api/admin/provider-config').set(auth).send({ active: 'gemini' });
    expect(put.body.active).toBe('gemini');
    const got = await request(b).get('/api/admin/provider-config').set(auth);
    expect(got.body.active).toBe('gemini');
    // Gemini has no key on this server, so the tutor stays in Demo mode.
    expect((await request(b).get('/api/health')).body.demo).toBe(true);
  });
});

describe('Upstash REST client', () => {
  let server: http.Server | null = null;
  afterEach(() => server?.close());

  it('speaks the Upstash pipeline protocol with a bearer token', async () => {
    const backing = new MemoryKv();
    const seen: { auth?: string; path?: string }[] = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        seen.push({ auth: req.headers.authorization, path: req.url });
        if (req.headers.authorization !== 'Bearer tok') {
          res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        const results = await backing.exec(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(results.map((result) => ({ result }))));
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const kv = new UpstashRestKv(url, 'tok');
    expect(await kv.exec([['SET', 'k', 'v', 'EX', 60], ['GET', 'k'], ['INCR', 'n']])).toEqual(['OK', 'v', 1]);
    expect(seen[0]).toEqual({ auth: 'Bearer tok', path: '/pipeline' });
    await expect(new UpstashRestKv(url, 'wrong').exec([['GET', 'k']])).rejects.toThrow('kv_http_401');

    const app = createApp({ backend: new RedisBackend(kv, { retentionDays: 30 }), config: SECRETS }).app;
    const me = await request(app).get('/api/me');
    expect(me.status).toBe(200);
    expect(backing.keys()).toContain(`lg:student:${me.body.studentId}`);
  });
});

describe('production config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to run without secrets or storage instead of inventing them', async () => {
    process.env.VERCEL = '1';
    delete process.env.LABGUIDE_COOKIE_SECRET;
    delete process.env.LABGUIDE_VAULT_KEY;
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    const cfg = loadConfig();
    expect(cfg.cookieSecret).toBe('');
    const problems = configErrors(cfg);
    expect(problems.join(' ')).toMatch(/LABGUIDE_COOKIE_SECRET/);
    expect(problems.join(' ')).toMatch(/LABGUIDE_VAULT_KEY/);
    expect(problems.join(' ')).toMatch(/Upstash Redis/);
    const res = await request(createApp().app).get('/api/me');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('server_misconfigured');
  });

  it('reads the Vercel KV variables and Vercel origins, and drops localhost', () => {
    Object.assign(process.env, {
      VERCEL: '1',
      VERCEL_URL: 'labguide-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'labguide.vercel.app',
      LABGUIDE_PUBLIC_ORIGIN: 'https://labguide.school.example/',
      LABGUIDE_COOKIE_SECRET: 'c'.repeat(64),
      LABGUIDE_VAULT_KEY: 'v'.repeat(64),
      KV_REST_API_URL: 'https://example.upstash.io',
      KV_REST_API_TOKEN: 'x',
    });
    const cfg = loadConfig();
    expect(configErrors(cfg)).toEqual([]);
    expect(cfg.kv).toEqual({ url: 'https://example.upstash.io', token: 'x' });
    expect(cfg.secureCookies).toBe(true);
    expect(cfg.allowedOrigins).toEqual([
      'https://labguide.school.example',
      'https://labguide-abc123.vercel.app',
      'https://labguide.vercel.app',
    ]);
  });

  it('accepts same-origin requests on Vercel and still rejects other origins', async () => {
    const app = createApp({
      backend: new RedisBackend(new MemoryKv(), { retentionDays: 30 }),
      config: { ...SECRETS, onVercel: true, production: true, secureCookies: true, allowedOrigins: [], kv: { url: 'unused', token: 'unused' } },
    }).app;
    const same = await request(app).get('/api/me').set('Host', 'labguide.vercel.app').set('Origin', 'https://labguide.vercel.app');
    expect(same.status).toBe(200);
    expect(([] as string[]).concat(same.headers['set-cookie'] ?? []).join(';')).toMatch(/Secure/i);
    const evil = await request(app).get('/api/me').set('Host', 'labguide.vercel.app').set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
  });
});
