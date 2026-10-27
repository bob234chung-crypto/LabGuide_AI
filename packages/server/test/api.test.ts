import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { safetyChecklist, type Plan } from '@labguide/shared';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { validateTutorDraft } from '../src/providers/schema.js';

process.env.NODE_ENV = 'test';

function client() {
  const { app, store } = createApp({ store: new Store(null), config: { adminToken: 'admin-test-token' } });
  if (!store) throw new Error('expected the file store');
  const agent = request.agent(app);
  let csrf = '';
  return {
    app,
    store,
    agent,
    async init() {
      const res = await agent.get('/api/me');
      const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      csrf = cookies.find((c) => c.startsWith('lg_csrf='))!.split(';')[0].split('=')[1];
      return res;
    },
    put: (url: string, body: unknown) => agent.put(url).set('x-csrf-token', csrf).send(body as object),
    post: (url: string, body: unknown = {}, headers: Record<string, string> = {}) =>
      agent.post(url).set('x-csrf-token', csrf).set(headers).send(body as object),
    del: (url: string) => agent.delete(url).set('x-csrf-token', csrf),
  };
}

async function fillPlan(c: ReturnType<typeof client>, id: string, extraStep?: string) {
  await c.put(`/api/sessions/${id}/stages/theme`, { value: { theme: 'photosynthesis', customTitle: '' } });
  await c.put(`/api/sessions/${id}/stages/hypothesis`, {
    value: 'If the lamp is closer to the pondweed, then more bubbles will be produced per minute.',
  });
  await c.put(`/api/sessions/${id}/stages/variables`, {
    value: {
      independent: 'Distance of the lamp',
      dependent: 'Number of bubbles per minute',
      controlled: [
        { id: 'a', text: 'Temperature of water' },
        { id: 'b', text: 'Type of pondweed' },
      ],
    },
  });
  await c.put(`/api/sessions/${id}/stages/apparatus`, {
    value: {
      selected: ['pondweed', 'boiling-tube', 'lamp', 'metre-rule', 'stopwatch', 'safety-goggles'],
      justifications: {
        'metre-rule': 'To measure the distance precisely in cm.',
        stopwatch: 'To time exactly one minute for each count.',
      },
    },
  });
  const steps = [
    'Put the pondweed in a boiling tube of water.',
    'Place the lamp 10 cm away using the metre rule.',
    'Count and record the bubbles for one minute.',
    'Repeat three times at each distance.',
  ];
  if (extraStep) steps.push(extraStep);
  await c.put(`/api/sessions/${id}/stages/procedure`, { value: steps.map((text, i) => ({ id: `s${i}`, text })) });
  const s = await c.agent.get(`/api/sessions/${id}`);
  const checklist: Record<string, boolean> = {};
  for (const item of safetyChecklist(s.body.session.plan as Plan)) checklist[item.id] = true;
  return c.put(`/api/sessions/${id}/stages/safety`, { value: { checklist } });
}

describe('API', () => {
  let c: ReturnType<typeof client>;
  beforeEach(async () => {
    c = client();
    await c.init();
  });

  it('rejects writes without the CSRF header', async () => {
    const res = await c.agent.post('/api/sessions').send({});
    expect(res.status).toBe(403);
  });

  it('rejects other origins (strict CORS)', async () => {
    const res = await c.agent.get('/api/sessions').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('enforces session ownership', async () => {
    const created = await c.post('/api/sessions');
    const other = client();
    await other.init();
    const res = await request(c.app).get(`/api/sessions/${created.body.session.id}`);
    expect(res.status).toBe(404);
  });

  it('runs the full plan flow and gates the diagram on validation', async () => {
    const { body } = await c.post('/api/sessions');
    const id = body.session.id;
    let locked = await c.put(`/api/sessions/${id}/progress`, { currentStage: 'diagram' });
    expect(locked.status).toBe(409);
    const filled = await fillPlan(c, id);
    expect(filled.body.validation.canGenerateDiagram).toBe(true);
    locked = await c.put(`/api/sessions/${id}/progress`, { currentStage: 'diagram' });
    expect(locked.status).toBe(200);
  });

  it('blocks progression when ethanol is heated with a flame', async () => {
    const { body } = await c.post('/api/sessions');
    const id = body.session.id;
    const res = await fillPlan(c, id, 'Heat the leaf in ethanol over a Bunsen burner flame.');
    expect(res.body.validation.canGenerateDiagram).toBe(false);
    expect(res.body.validation.safetyBlocks[0].ruleId).toBe('ethanol_flame');
    const chat = await c.post(`/api/sessions/${id}/chat`, { type: 'check', stage: 'procedure' });
    const reply = chat.body.messages.at(-1);
    expect(reply.kind).toBe('safety');
    expect(reply.demo).toBe(true);
    expect(reply.text).toMatch(/Do not heat ethanol/);
    expect((await c.put(`/api/sessions/${id}/progress`, { currentStage: 'safety' })).status).toBe(409);
  });

  it('tutor replies are labelled demo and ask at most 3 questions', async () => {
    const { body } = await c.post('/api/sessions');
    const id = body.session.id;
    for (const type of ['enter', 'check', 'hint', 'hint', 'hint']) {
      const r = await c.post(`/api/sessions/${id}/chat`, { type, stage: 'variables' });
      const reply = r.body.messages.at(-1);
      if (!reply) continue;
      expect(reply.demo).toBe(true);
      expect(reply.questions.length + (reply.text.match(/\?/g) ?? []).length).toBeLessThanOrEqual(3);
    }
    const third = (await c.agent.get(`/api/sessions/${id}`)).body.session.chat.at(-1);
    expect(third.hintLevel).toBe(3);
    expect(third.text).toMatch(/could not find the lesson/);
    expect(third.text).not.toMatch(/different topic|toy car|pendulum/);
    expect(third.questions.length).toBeLessThanOrEqual(3);
  });

  it('keeps the student message when the provider fails', async () => {
    const { body } = await c.post('/api/sessions');
    const id = body.session.id;
    await c.put('/api/settings/demo', { simulateErrors: true });
    const r = await c.post(`/api/sessions/${id}/chat`, { type: 'message', stage: 'theme', text: 'Help me choose' });
    expect(r.status).toBe(503);
    expect(r.body.retryable).toBe(true);
    const s = await c.agent.get(`/api/sessions/${id}`);
    expect(s.body.session.chat.some((m: { text: string }) => m.text === 'Help me choose')).toBe(true);
  });

  it('saves diagram versions idempotently and blocks unsafe submit', async () => {
    const { body } = await c.post('/api/sessions');
    const id = body.session.id;
    await fillPlan(c, id);
    const unsafe = {
      items: [
        { id: 'b', apparatusId: 'bunsen-burner', x: 400, y: 430, rotation: 0, label: 'Bunsen burner' },
        { id: 'e', apparatusId: 'ethanol-tube', x: 410, y: 250, rotation: 0, label: 'Ethanol' },
      ],
      containment: [],
      connections: [],
      labels: [],
    };
    const draft = await c.put(`/api/sessions/${id}/diagrams`, { scene: unsafe });
    expect(draft.body.checks.some((x: { severity: string; passed: boolean }) => x.severity === 'safety_block' && !x.passed)).toBe(true);
    const submit = await c.post(`/api/diagrams/${draft.body.id}/submit`);
    expect(submit.status).toBe(409);

    const v1 = await c.post(`/api/sessions/${id}/diagrams`, { scene: unsafe }, { 'Idempotency-Key': 'k1' });
    const again = await c.post(`/api/sessions/${id}/diagrams`, { scene: unsafe }, { 'Idempotency-Key': 'k1' });
    expect(v1.status).toBe(201);
    expect(again.body.id).toBe(v1.body.id);
    const list = await c.agent.get(`/api/sessions/${id}/diagrams`);
    expect(list.body.versions).toHaveLength(1);
  });

  it('rejects unknown apparatus in a scene', async () => {
    const { body } = await c.post('/api/sessions');
    await fillPlan(c, body.session.id);
    const r = await c.put(`/api/sessions/${body.session.id}/diagrams`, {
      scene: { items: [{ id: 'x', apparatusId: 'rocket', x: 0, y: 0 }] },
    });
    expect(r.status).toBe(400);
  });

  it('simulates the Poe connection without a real request and never says Connected', async () => {
    const start = await c.agent.get('/api/connect/poe/start?consent=yes');
    expect(start.status).toBe(303);
    expect(start.headers.location).toMatch(/^\/api\/connect\/poe\/callback\?state=/);
    const cb = await c.agent.get(start.headers.location);
    expect(cb.headers.location).toBe('/settings?poe=demo_connected');
    const status = await c.agent.get('/api/settings/provider');
    expect(status.body.poe.state).toBe('demo_simulated');
    expect(status.body.poe.label).toMatch(/Demo mode – no real connection/);
    expect(JSON.stringify(status.body)).not.toMatch(/"Connected"/);
    expect(JSON.stringify(status.body)).not.toMatch(/token/i);
  });

  it('rejects a callback with a forged state', async () => {
    const cb = await c.agent.get('/api/connect/poe/callback?state=forged&code=x&demo=1');
    expect(cb.headers.location).toBe('/settings?poe=state_mismatch');
  });

  it('hides admin endpoints without the admin token', async () => {
    expect((await c.agent.get('/api/admin/provider-config')).status).toBe(404);
    const ok = await c.agent.get('/api/admin/provider-config').set('Authorization', 'Bearer admin-test-token');
    expect(ok.status).toBe(200);
    const bad = await c.agent.put('/api/admin/provider-config').set('Authorization', 'Bearer admin-test-token').send({ active: 'evil' });
    expect(bad.status).toBe(400);
  });

  it('serves the apparatus library by theme', async () => {
    const r = await c.agent.get('/api/apparatus?theme=insulation');
    expect(r.body.note).toBe('Hot water provided by the teacher.');
    expect(r.body.themeItems.map((a: { id: string }) => a.id)).toContain('tongs');
    expect(r.body.common.map((a: { id: string }) => a.id)).toContain('bunsen-burner');
  });

  it('serves the light practical and keeps the rate-of-photosynthesis theme', async () => {
    const light = await c.agent.get('/api/apparatus?theme=light-needed');
    const ids = light.body.themeItems.map((a: { id: string }) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['leaf', 'foil-strip', 'alcohol-tube', 'iodine-solution', 'white-tile']));
    expect(ids).not.toContain('pondweed');
    expect(light.body.common.map((a: { id: string }) => a.id)).toEqual(
      expect.arrayContaining(['bunsen-burner', 'safety-goggles', 'tripod', 'gauze']),
    );
    const rate = await c.agent.get('/api/apparatus?theme=photosynthesis');
    expect(rate.body.themeItems.map((a: { id: string }) => a.id)).toContain('pondweed');
    expect(rate.body.themeItems.map((a: { id: string }) => a.id)).not.toContain('foil-strip');
    const { body } = await c.post('/api/sessions');
    const saved = await c.put(`/api/sessions/${body.session.id}/stages/theme`, {
      value: { theme: 'light-needed', customTitle: '' },
    });
    expect(saved.body.session.plan.theme.theme).toBe('light-needed');
    expect(saved.body.session.title).toBe('Is light needed?');
  });

  it('deletes all my data', async () => {
    await c.post('/api/sessions');
    await c.del('/api/me');
    expect(Object.keys(c.store.data.sessions)).toHaveLength(0);
  });

  it('purges data after 30 days', async () => {
    const { body } = await c.post('/api/sessions');
    c.store.data.sessions[body.session.id].updatedAt = new Date(Date.now() - 31 * 864e5).toISOString();
    expect(c.store.purgeExpired(30)).toBe(1);
  });
});

describe('tutor output schema', () => {
  it('repairs a question list that would pass 3 questions, and rejects text with more than 3', () => {
    expect(validateTutorDraft({ kind: 'socratic', text: 'A? B?', questions: ['C?', 'D?'] }).questions).toEqual(['C?']);
    expect(() => validateTutorDraft({ kind: 'socratic', text: 'A? B? C? D?', questions: [] })).toThrow();
  });
  it('strips markup and unknown kinds', () => {
    expect(() => validateTutorDraft({ kind: 'exec', text: 'x', questions: [] })).toThrow();
    expect(validateTutorDraft({ kind: 'hint', text: '<b>Hi</b>', questions: [] }).text).toBe('Hi');
  });
});
