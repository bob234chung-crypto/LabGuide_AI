import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import {
  apparatusForTheme,
  checkDiagram,
  emptyPlan,
  emptyScene,
  hasSafetyBlock,
  isAppStageUnlocked,
  isReviewedStage,
  reviewsNeededFor,
  safetyChecklist,
  sanitizeScene,
  stageAnswerKey,
  themeTitle,
  validatePlan,
  PLAN_STAGES,
  STAGE_TITLES,
  type AppStage,
  type ChatRequest,
  type Diagram,
  type DiagramMethod,
  type PlanValidation,
  type ProviderStatus,
  type ReviewedStage,
  type Session,
  type SessionSummary,
  type StageReview,
  type StudentMessage,
  type ThemeId,
  type TutorReply,
} from '@labguide/shared';
import {
  configErrors,
  deepseekConfigured,
  loadConfig,
  geminiConfigured,
  poeConfigured,
  type ProviderName,
  type ServerConfig,
} from './config.js';
import { BusyError, FileBackend, RedisBackend, requestScope, type DataBackend } from './datastore.js';
import { KvError, MemoryKv, UpstashRestKv, type KvClient } from './kv.js';
import { SpendMeter } from './spend.js';
import { log, redactUrl } from './logger.js';
import { ProviderRegistry } from './providers/registry.js';
import { createOAuthState, createPkcePair } from './providers/poe.js';
import { ProviderError } from './providers/types.js';
import { APP_STAGES, BadInput, sanitizeStage } from './sanitize.js';
import {
  CSRF_COOKIE,
  STUDENT_COOKIE,
  csrfProtection,
  rateLimit,
  readStudentCookie,
  requireAdmin,
  strictCors,
  studentAuth,
} from './security.js';
import { Store } from './store.js';
import { Vault } from './vault.js';

const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const now = () => new Date().toISOString();

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

/** helmet settings shared by the API and (on Vercel) the static files. */
export function securityHeaders(secure: boolean) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: secure,
  });
}

function defaultBackend(cfg: ServerConfig, store?: Store): DataBackend {
  if (store) return new FileBackend(store);
  if (cfg.kv) return new RedisBackend(new UpstashRestKv(cfg.kv.url, cfg.kv.token), { retentionDays: cfg.retentionDays });
  return new FileBackend(new Store(cfg.dataDir));
}

export interface AppDeps {
  /** Upstream HTTP client for provider calls (tests pass a mock). */
  fetch?: typeof fetch;
  /** Where the shared daily spend counter lives. Defaults to Redis when configured. */
  spendKv?: KvClient;
}

/** Leaves time inside the 30 s function limit and per-student lock for saving the result. */
const AI_WORK_BUDGET_MS = 22_000;

export function createApp(
  opts: { config?: Partial<ServerConfig>; store?: Store; backend?: DataBackend; deps?: AppDeps } = {},
) {
  const cfg = loadConfig(opts.config);
  const backend = opts.backend ?? defaultBackend(cfg, opts.store);
  const store = backend instanceof FileBackend ? backend.store : null;
  const vault = new Vault(cfg.vaultKey);
  const spendKv = opts.deps?.spendKv ?? (cfg.kv ? new UpstashRestKv(cfg.kv.url, cfg.kv.token) : new MemoryKv());
  const meter = new SpendMeter(spendKv, cfg.dailySpendCapUsd);
  const providers = new ProviderRegistry(cfg, { meter, fetch: opts.deps?.fetch });
  const db = (req: Request) => req.store!;
  const scope = requestScope(backend, (req) => readStudentCookie(cfg, req.cookies?.[STUDENT_COOKIE]));

  const app = express();
  app.disable('x-powered-by');
  // Vercel's edge sets X-Forwarded-For to the real client IP and drops spoofed values.
  app.set('trust proxy', cfg.onVercel ? true : 'loopback');
  app.use(securityHeaders(cfg.secureCookies));

  const problems = configErrors(cfg);
  if (problems.length) {
    for (const p of problems) log.warn('config_error', { problem: p });
    app.use('/api', (_req, res) => {
      res.status(500).json({ error: 'server_misconfigured', message: 'LabGuide is not set up yet.', problems });
    });
    return { app, store, cfg, backend, problems };
  }

  app.use(strictCors(cfg));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/')) log.info('request', { method: req.method, url: redactUrl(req.originalUrl) });
    next();
  });

  const api = express.Router();
  api.use(rateLimit(backend, { capacity: 240, refillPerSec: 6, key: (req) => `ip:${req.ip}` }));
  api.use(scope);
  api.use(studentAuth(cfg));
  api.use(rateLimit(backend, { capacity: 180, refillPerSec: 5, key: (req) => `stu:${req.studentId}` }));

  /* ---------- Helpers ---------- */

  function ownedSession(req: Request, res: Response): Session | null {
    const s = db(req).data.sessions[req.params.id];
    if (!s || s.ownerId !== req.studentId) {
      res.status(404).json({ error: 'not_found', message: 'We could not find that investigation.' });
      return null;
    }
    return s;
  }

  function ownedDiagram(req: Request, res: Response): { diagram: Diagram; session: Session; working: boolean } | null {
    const id = req.params.id;
    const saved = db(req).data.diagrams[id];
    const session = saved
      ? db(req).data.sessions[saved.sessionId]
      : Object.values(db(req).data.sessions).find((s) => s.workingDiagram?.id === id);
    if (!session || session.ownerId !== req.studentId) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    return { diagram: saved ?? session.workingDiagram!, session, working: !saved };
  }

  function sessionPayload(s: Session) {
    return { session: s, validation: validatePlan(s.plan), checklist: safetyChecklist(s.plan) };
  }

  const REVIEW_FALLBACK_NOTE: Record<NonNullable<StageReview['fallbackReason']>, string> = {
    not_configured: 'Checked with LabGuide’s built-in checks (Demo mode – no AI tutor on this server).',
    budget: 'The AI tutor has reached today’s limit, so LabGuide used its built-in checks instead.',
    unavailable: 'The AI tutor is not available right now, so LabGuide used its built-in checks instead.',
    invalid_output: 'The AI tutor’s reply could not be used, so LabGuide used its built-in checks instead.',
    suspicious_input: 'LabGuide found words that are not part of a science answer.',
  };

  /**
   * Reviews one stage (after the rules pass) and stores the verdict on the session. A verdict
   * for unchanged answers is reused, except a heuristic failure, which is retried in case the AI
   * is available again. A failed review adds a guiding tutor message (questions, never answers).
   */
  async function reviewStage(req: Request, s: Session, stage: ReviewedStage, validation: PlanValidation, deadline: number) {
    const answerKey = stageAnswerKey(s.plan, stage);
    const cached = s.stageReviews?.[stage];
    if (cached && cached.answerKey === answerKey && (cached.passed || cached.source === 'ai')) return { review: cached, message: null };
    const result = await providers.reviewStage(db(req), { stage, plan: s.plan, validation }, deadline);
    const review: StageReview = { stage, answerKey, reviewedAt: now(), ...result };
    s.stageReviews = { ...s.stageReviews, [stage]: review };
    let message: TutorReply | null = null;
    if (!review.passed) {
      const title = stage === 'summary' ? 'whole plan' : STAGE_TITLES[stage].toLowerCase();
      message = {
        id: newId('msg'),
        role: 'tutor',
        stage,
        kind: 'socratic',
        text: [
          `Not yet. Your ${title} needs a little more work before you move on. Think about ${review.feedbackQuestions.length > 1 ? 'these questions' : 'this question'}.`,
          review.fallbackReason ? REVIEW_FALLBACK_NOTE[review.fallbackReason] : '',
        ]
          .filter(Boolean)
          .join(' '),
        questions: review.feedbackQuestions,
        demo: false,
        provider: review.source === 'ai' ? 'deepseek' : 'rules',
        createdAt: now(),
      };
      s.chat.push(message);
    }
    return { review, message };
  }

  /**
   * Server-side gate for moving to `target`: the deterministic rules first (they always win),
   * then a quality review of every earlier reviewed stage whose answers changed since it passed.
   */
  async function gate(req: Request, s: Session, target: AppStage) {
    const validation = validatePlan(s.plan);
    if (!isAppStageUnlocked(validation, target)) {
      return { ok: false as const, status: 409, body: { error: 'stage_locked', message: 'Finish the earlier stages first.', validation } };
    }
    const deadline = Date.now() + AI_WORK_BUDGET_MS;
    for (const stage of reviewsNeededFor(target)) {
      const { review, message } = await reviewStage(req, s, stage, validation, deadline);
      if (!review.passed) {
        return {
          ok: false as const,
          status: 409,
          body: {
            error: 'review_failed',
            stage,
            review,
            note: review.fallbackReason ? REVIEW_FALLBACK_NOTE[review.fallbackReason] : null,
            message: 'Not yet. Look at the tutor’s questions, improve your answer, then try again.',
            messages: message ? [message] : [],
          },
        };
      }
    }
    return { ok: true as const };
  }

  function touch(req: Request, s: Session) {
    s.updatedAt = now();
    db(req).save();
  }

  function versionsOf(req: Request, sessionId: string): Diagram[] {
    return Object.values(db(req).data.diagrams)
      .filter((d) => d.sessionId === sessionId)
      .sort((a, b) => a.version - b.version);
  }

  async function providerStatus(req: Request): Promise<ProviderStatus> {
    const studentId = req.studentId!;
    const cred = db(req).data.credentials[studentId];
    const active = providers.active(db(req));
    const poeReady = poeConfigured(cfg);
    const dsConfigured = deepseekConfigured(cfg);
    const dsHealth = dsConfigured ? await providers.deepseek.health() : null;
    const budgetReached = await providers.budgetReached(db(req));
    return {
      activeProvider: active.id,
      demoMode: active.demo || budgetReached,
      deepseek: {
        configuredOnServer: dsConfigured,
        // "Connected" only with a server key AND a passing health check.
        state: !dsConfigured ? 'not_configured' : dsHealth?.ok ? 'connected' : 'configured_unreachable',
        label: !dsConfigured
          ? 'Not configured on this server – the Demo tutor is used'
          : dsHealth?.ok
            ? 'Connected (configured on the server)'
            : 'Configured on the server – not reachable right now',
        model: dsConfigured ? cfg.provider.deepseek.model : null,
        budgetReached,
        dailyCapUsd: cfg.dailySpendCapUsd,
      },
      poe: {
        configuredOnServer: poeReady,
        // Never "Connected": a real connection needs real credentials + registration + callback.
        state: cred?.demo ? 'demo_simulated' : poeReady ? 'demo_not_connected' : 'demo_not_connected',
        label: cred?.demo
          ? 'Simulated connection – Demo mode – no real connection'
          : 'Not connected – Demo mode – no real connection',
      },
      gemini: {
        configuredOnServer: geminiConfigured(cfg),
        state: geminiConfigured(cfg) ? 'managed_by_school' : 'not_configured',
        label: geminiConfigured(cfg)
          ? 'Managed by your school / app administrator (configured on the server)'
          : 'Managed by your school / app administrator – not configured on this server',
      },
      retentionDays: cfg.retentionDays,
      simulateErrors: db(req).data.students[studentId]?.simulateErrors ?? false,
    };
  }

  /* ---------- Me / settings ---------- */

  api.get('/me', (req, res) => {
    const st = db(req).data.students[req.studentId!];
    res.json({ studentId: st.id, nickname: st.nickname });
  });

  api.use(csrfProtection);

  api.put('/me', (req, res) => {
    const st = db(req).data.students[req.studentId!];
    st.nickname = String(req.body?.nickname ?? '')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .slice(0, 24);
    db(req).save();
    res.json({ studentId: st.id, nickname: st.nickname });
  });

  api.delete('/me', (req, res) => {
    db(req).deleteStudent(req.studentId!);
    res.clearCookie(STUDENT_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    res.json({ deleted: true });
  });

  api.get('/settings/provider', wrap(async (req, res) => res.json(await providerStatus(req))));

  api.put('/settings/demo', wrap(async (req, res) => {
    const st = db(req).data.students[req.studentId!];
    st.simulateErrors = req.body?.simulateErrors === true;
    db(req).save();
    res.json(await providerStatus(req));
  }));

  /* ---------- Apparatus library (read-only) ---------- */

  api.get('/apparatus', (req, res) => {
    const theme = String(req.query.theme ?? '') as ThemeId;
    const valid = ['photosynthesis', 'enzyme', 'dissolving', 'insulation', 'custom'].includes(theme) ? theme : null;
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json(apparatusForTheme(valid));
  });

  /* ---------- Sessions ---------- */

  api.get('/sessions', (req, res) => {
    const list: SessionSummary[] = Object.values(db(req).data.sessions)
      .filter((s) => s.ownerId === req.studentId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((s) => ({
        id: s.id,
        title: s.title,
        theme: s.plan.theme.theme,
        currentStage: s.currentStage,
        updatedAt: s.updatedAt,
        diagramVersions: versionsOf(req, s.id).length,
      }));
    res.json(list);
  });

  api.post('/sessions', (req, res) => {
    const owned = Object.values(db(req).data.sessions).filter((s) => s.ownerId === req.studentId);
    if (owned.length >= 30) return res.status(409).json({ error: 'too_many', message: 'Delete an old investigation first.' });
    const s: Session = {
      id: newId('ses'),
      ownerId: req.studentId!,
      title: 'New investigation',
      plan: emptyPlan(),
      currentStage: 'theme',
      diagramMethod: null,
      workingDiagram: null,
      chat: [],
      hintLevels: {},
      createdAt: now(),
      updatedAt: now(),
    };
    db(req).data.sessions[s.id] = s;
    db(req).save();
    res.status(201).json(sessionPayload(s));
  });

  api.get('/sessions/:id', (req, res) => {
    const s = ownedSession(req, res);
    if (s) res.json(sessionPayload(s));
  });

  api.delete('/sessions/:id', (req, res) => {
    const s = ownedSession(req, res);
    if (!s) return;
    db(req).deleteSession(s.id);
    db(req).save();
    res.json({ deleted: true });
  });

  api.put('/sessions/:id/stages/:stage', (req, res) => {
    const s = ownedSession(req, res);
    if (!s) return;
    const { stage, value } = sanitizeStage(req.params.stage, req.body?.value);
    (s.plan as unknown as Record<string, unknown>)[stage] = value;
    s.title = themeTitle(s.plan.theme.theme, s.plan.theme.customTitle);
    touch(req, s);
    res.json(sessionPayload(s));
  });

  const reviewLimit = rateLimit(backend, { capacity: 40, refillPerSec: 1, key: (req) => `review:${req.studentId}` });

  /** Moving between stages. Moving forward past a reviewed stage runs (or reuses) its quality review. */
  api.put('/sessions/:id/progress', reviewLimit, wrap(async (req, res) => {
    const s = ownedSession(req, res);
    if (!s) return;
    const target = String(req.body?.currentStage ?? '') as AppStage;
    if (!APP_STAGES.includes(target)) throw new BadInput('unknown stage');
    const result = await gate(req, s, target);
    if (!result.ok) {
      touch(req, s);
      return res.status(result.status).json({ ...result.body, ...sessionPayload(s) });
    }
    s.currentStage = target;
    const method = req.body?.diagramMethod as DiagramMethod | undefined;
    if (method === 'canvas') s.diagramMethod = 'canvas';
    touch(req, s);
    res.json(sessionPayload(s));
  }));

  /** Quality review of one stage without moving (default: the whole plan). */
  api.post('/sessions/:id/review', reviewLimit, wrap(async (req, res) => {
    const s = ownedSession(req, res);
    if (!s) return;
    const stage = String(req.body?.stage ?? 'summary');
    if (!isReviewedStage(stage)) throw new BadInput('unknown stage');
    const validation = validatePlan(s.plan);
    if (!validation.stages[stage].complete) {
      return res.json({ review: null, ...sessionPayload(s) });
    }
    const { review, message } = await reviewStage(req, s, stage, validation, Date.now() + AI_WORK_BUDGET_MS);
    touch(req, s);
    res.json({ review, messages: message ? [message] : [], ...sessionPayload(s) });
  }));

  /* ---------- Tutor chat ---------- */

  api.post(
    '/sessions/:id/chat',
    rateLimit(backend, { capacity: 20, refillPerSec: 0.5, key: (req) => `chat:${req.studentId}` }),
    wrap(async (req, res) => {
      const s = ownedSession(req, res);
      if (!s) return;
      const body = req.body ?? {};
      const stage = String(body.stage) as AppStage;
      if (!APP_STAGES.includes(stage)) throw new BadInput('unknown stage');
      const type = String(body.type);
      if (!['message', 'hint', 'check', 'enter'].includes(type)) throw new BadInput('unknown type');
      const text = String(body.text ?? '').slice(0, 500).trim();
      if (type === 'message' && !text) throw new BadInput('empty message');
      const request = (type === 'message' ? { type, stage, text } : { type, stage }) as ChatRequest;

      const student = db(req).data.students[req.studentId!];
      const day = now().slice(0, 10);
      if (student.turns.day !== day) student.turns = { day, count: 0 };
      if (student.turns.count >= cfg.dailyTurnBudget) {
        return res.status(429).json({ error: 'budget', message: 'You have used today’s tutor turns. Your work is saved. Continue later.' });
      }

      // Save the student's message first so a provider error never loses it.
      const added: StudentMessage[] = [];
      if (type === 'message' && body.retry !== true) {
        const m: StudentMessage = { id: newId('msg'), role: 'student', text, stage, createdAt: now() };
        s.chat.push(m);
        added.push(m);
      }
      if (type === 'enter' && s.chat.some((m) => m.role === 'tutor' && m.stage === stage)) {
        return res.json({ messages: [] });
      }
      let hintLevel = (s.hintLevels[stage] ?? 0) as number;
      if (type === 'hint') hintLevel = Math.min(3, hintLevel + 1);
      touch(req, s);

      const validation = validatePlan(s.plan);
      const diagramChecks = s.workingDiagram ? checkDiagram(s.workingDiagram.scene, s.plan) : [];
      try {
        const { draft, demo, provider, fallback } = await providers.sendTurn(db(req),
          {
            request,
            stage,
            plan: s.plan,
            validation,
            diagramChecks,
            hintLevel: Math.max(1, hintLevel) as 1 | 2 | 3,
            history: s.chat.slice(-10),
          },
          { simulateError: student.simulateErrors && type !== 'enter' },
        );
        if (type === 'hint') s.hintLevels[stage] = hintLevel;
        const reply: TutorReply = {
          id: newId('msg'),
          role: 'tutor',
          stage,
          demo,
          provider,
          ...(fallback ? { fallback } : {}),
          createdAt: now(),
          ...draft,
        };
        s.chat.push(reply);
        if (s.chat.length > 400) s.chat = s.chat.slice(-400);
        student.turns.count++;
        touch(req, s);
        res.json({ messages: [...added, reply] });
      } catch (err) {
        const pe = err instanceof ProviderError ? err : null;
        log.warn('tutor_error', { code: pe?.code ?? 'unknown' });
        res.status(503).json({
          error: 'provider_unavailable',
          retryable: pe?.retryable ?? true,
          message: 'The tutor is not available right now. Your work is saved.',
          saved: added,
        });
      }
    }),
  );

  /* ---------- Diagrams ---------- */

  function requirePlanReady(s: Session, res: Response): boolean {
    const v = validatePlan(s.plan);
    if (!v.canGenerateDiagram) {
      res.status(409).json({ error: 'plan_not_ready', message: 'Finish your plan and fix any safety problems first.', validation: v });
      return false;
    }
    return true;
  }

  api.get('/sessions/:id/diagrams', (req, res) => {
    const s = ownedSession(req, res);
    if (!s) return;
    res.json({ working: s.workingDiagram, versions: versionsOf(req, s.id) });
  });

  /** Autosave of the working canvas. */
  api.put('/sessions/:id/diagrams', (req, res) => {
    const s = ownedSession(req, res);
    if (!s || !requirePlanReady(s, res)) return;
    const scene = sanitizeScene(req.body?.scene ?? emptyScene());
    const nextVersion = versionsOf(req, s.id).length + 1;
    const d: Diagram = {
      id: s.workingDiagram?.id ?? newId('dia'),
      sessionId: s.id,
      version: nextVersion,
      method: 'canvas',
      scene,
      checks: checkDiagram(scene, s.plan),
      status: 'draft',
      createdAt: s.workingDiagram?.createdAt ?? now(),
    };
    s.workingDiagram = d;
    s.diagramMethod = 'canvas';
    touch(req, s);
    res.json(d);
  });

  /** Save a version (idempotent with the Idempotency-Key header). */
  api.post('/sessions/:id/diagrams', (req, res) => {
    const s = ownedSession(req, res);
    if (!s || !requirePlanReady(s, res)) return;
    const key = String(req.get('idempotency-key') ?? '').slice(0, 80);
    if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
    const scoped = `${req.studentId}:${s.id}:${key}`;
    const prior = db(req).data.idempotency[scoped];
    if (prior && db(req).data.diagrams[prior.diagramId]) return res.status(200).json(db(req).data.diagrams[prior.diagramId]);
    const scene = sanitizeScene(req.body?.scene ?? s.workingDiagram?.scene ?? emptyScene());
    const d: Diagram = {
      id: newId('dia'),
      sessionId: s.id,
      version: versionsOf(req, s.id).length + 1,
      method: 'canvas',
      scene,
      checks: checkDiagram(scene, s.plan),
      status: req.body?.status === 'submitted' ? 'submitted' : 'draft',
      createdAt: now(),
    };
    if (d.status === 'submitted' && hasSafetyBlock(d.checks)) {
      return res.status(409).json({ error: 'safety_block', message: 'Fix the safety problem before you submit.', checks: d.checks });
    }
    db(req).data.diagrams[d.id] = d;
    db(req).data.idempotency[scoped] = { diagramId: d.id, createdAt: now() };
    if (s.workingDiagram) s.workingDiagram.version = d.version + 1;
    touch(req, s);
    res.status(201).json(d);
  });

  api.get('/diagrams/:id', (req, res) => {
    const found = ownedDiagram(req, res);
    if (found) res.json(found.diagram);
  });

  api.post('/diagrams/:id/check', (req, res) => {
    const found = ownedDiagram(req, res);
    if (!found) return;
    const checks = checkDiagram(found.diagram.scene, found.session.plan);
    found.diagram.checks = checks;
    db(req).save();
    res.json({ checks, safetyBlocked: hasSafetyBlock(checks) });
  });

  api.post('/diagrams/:id/submit', (req, res) => {
    const found = ownedDiagram(req, res);
    if (!found) return;
    const checks = checkDiagram(found.diagram.scene, found.session.plan);
    found.diagram.checks = checks;
    if (hasSafetyBlock(checks)) {
      db(req).save();
      return res.status(409).json({ error: 'safety_block', message: 'Fix the safety problem before you submit.', checks });
    }
    found.diagram.status = 'submitted';
    touch(req, found.session);
    res.json(found.diagram);
  });

  api.delete('/diagrams/:id', (req, res) => {
    const found = ownedDiagram(req, res);
    if (!found) return;
    if (found.working) found.session.workingDiagram = null;
    else delete db(req).data.diagrams[found.diagram.id];
    touch(req, found.session);
    res.json({ deleted: true });
  });

  // TODO(photo upload): add POST /api/sessions/:id/diagrams/photo here when the
  // "photo" DiagramMethod is built (size/type limits, malware scan, 30-day retention).
  // Intentionally no upload endpoint in this version.

  /* ---------- Poe connection (simulated in demo) ---------- */

  api.get('/connect/poe/start', (req, res) => {
    if (req.query.consent !== 'yes') {
      return res.redirect(303, '/settings?poe=consent_required');
    }
    const state = createOAuthState();
    const { verifier, challenge } = createPkcePair();
    db(req).data.oauth[state] = { studentId: req.studentId!, verifier, expires: Date.now() + 10 * 60 * 1000 };
    if (poeConfigured(cfg) && cfg.provider.active === 'poe') {
      // Real flow: redirect to Poe's authorize URL (exact redirect URI, S256 challenge, state).
      try {
        return res.redirect(303, providers.poe.buildAuthorizeUrl(state, challenge));
      } catch {
        delete db(req).data.oauth[state];
        return res.redirect(303, '/settings?poe=not_configured');
      }
    }
    // Demo mode: no request leaves this server. We jump straight to our own callback.
    res.redirect(303, `/api/connect/poe/callback?state=${encodeURIComponent(state)}&code=demo&demo=1`);
  });

  api.get('/connect/poe/callback', wrap(async (req, res) => {
    const state = String(req.query.state ?? '');
    const pending = Object.hasOwn(db(req).data.oauth, state) ? db(req).data.oauth[state] : undefined;
    delete db(req).data.oauth[state];
    if (!pending || pending.studentId !== req.studentId || pending.expires < Date.now()) {
      return res.redirect(303, '/settings?poe=state_mismatch');
    }
    if (req.query.error) return res.redirect(303, '/settings?poe=denied');
    if (req.query.demo === '1') {
      db(req).data.credentials[req.studentId!] = {
        studentId: req.studentId!,
        provider: 'poe',
        ciphertext: vault.encrypt(`demo-token-${randomUUID()}`),
        demo: true,
        createdAt: now(),
      };
      db(req).save();
      return res.redirect(303, '/settings?poe=demo_connected');
    }
    try {
      const tokens = await providers.poe.exchangeCode(String(req.query.code ?? ''), pending.verifier);
      db(req).data.credentials[req.studentId!] = {
        studentId: req.studentId!,
        provider: 'poe',
        ciphertext: vault.encrypt(JSON.stringify(tokens)),
        demo: false,
        createdAt: now(),
      };
      db(req).save();
      res.redirect(303, '/settings?poe=connected');
    } catch {
      res.redirect(303, '/settings?poe=error');
    }
  }));

  api.post('/connect/poe/disconnect', wrap(async (req, res) => {
    const cred = db(req).data.credentials[req.studentId!];
    if (cred && !cred.demo) {
      try {
        await providers.poe.revoke(vault.decrypt(cred.ciphertext));
      } catch {
        log.warn('poe_revoke_failed');
      }
    }
    delete db(req).data.credentials[req.studentId!];
    db(req).save();
    res.json(await providerStatus(req));
  }));

  /* ---------- Admin (hidden from students; bearer token from the secret store) ---------- */

  const admin = express.Router();
  admin.use(requireAdmin(cfg));
  admin.use(scope);
  admin.get('/provider-config', wrap(async (req, res) => {
    res.json({
      active: db(req).data.providerConfig.updatedAt ? db(req).data.providerConfig.active : cfg.provider.active,
      /** What actually answers: falls back to demo when the chosen provider is not configured. */
      effective: providers.active(db(req)).id,
      serverDefault: cfg.provider.active,
      allowlist: cfg.provider.allowlist,
      poe: { configured: poeConfigured(cfg), model: cfg.provider.poe.model },
      gemini: { configured: geminiConfigured(cfg), model: cfg.provider.gemini.model },
      deepseek: { configured: deepseekConfigured(cfg), model: cfg.provider.deepseek.model },
      spend: { dailyCapUsd: cfg.dailySpendCapUsd, spentTodayUsd: await meter.spentTodayUsd() },
      updatedAt: db(req).data.providerConfig.updatedAt,
    });
  }));
  admin.put('/provider-config', (req, res) => {
    const active = String(req.body?.active);
    if (!(cfg.provider.allowlist as readonly string[]).includes(active)) {
      return res.status(400).json({ error: 'provider_not_allowlisted' });
    }
    db(req).data.providerConfig = { active: active as ProviderName, updatedAt: now() };
    db(req).save();
    res.json(db(req).data.providerConfig);
  });
  admin.post('/provider-test', wrap(async (req, res) => {
    res.json(await providers.active(db(req)).health());
  }));

  app.get('/api/health', scope, (req, res) => res.json({ ok: true, demo: providers.active(db(req)).demo }));
  app.use('/api/admin', admin);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // Serve the built frontend if present (single-port preview).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BusyError || err instanceof KvError) {
      log.warn('storage_unavailable', { reason: err.message });
      return res.status(503).json({ error: 'storage_unavailable', retryable: true, message: 'Please try again in a moment. Your saved work is safe.' });
    }
    if (err instanceof BadInput || (err instanceof Error && /scene|invalid|unknown|unique|cycle/.test(err.message))) {
      return res.status(400).json({ error: 'bad_input', message: 'That input was not valid.' });
    }
    if ((err as { type?: string })?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'too_large' });
    }
    log.warn('unhandled_error', { name: (err as Error)?.name });
    res.status(500).json({ error: 'server_error', message: 'Something went wrong. Your saved work is safe.' });
  });

  return { app, store, cfg, backend, problems };
}

export { PLAN_STAGES };
