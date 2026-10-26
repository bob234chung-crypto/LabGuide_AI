# LabGuide AI (prototype)

A Socratic science-investigation tutor for Hong Kong S1–S3 students (English only). Students
plan a fair test across seven stages (Theme, Hypothesis, Variables, Apparatus, Procedure,
Safety, Summary), then build a 2D sectional diagram on a drag-and-drop canvas and export it
as PNG or PDF.

**Everything AI-related in this prototype runs in Demo mode.** The tutor replies come from
deterministic templates, the Poe connection is simulated, and no request is ever sent to Poe,
Gemini or any other provider.

## Requirements

- Node.js 22+ and npm 10+
- (Optional, for the end-to-end script) Google Chrome at `/usr/local/bin/google-chrome`
  or set `CHROME_PATH`

## Run it

```bash
npm install
npm run dev:server   # API on http://localhost:8787 (tsx watch)
npm run dev:web      # Vite on http://localhost:5173, proxies /api to the server
```

Open http://localhost:5173. Data is kept in `packages/server/data/db.json` (created on first
run, git-ignored). Without `LABGUIDE_COOKIE_SECRET` and `LABGUIDE_VAULT_KEY` the server makes
random ones per boot, so students lose their anonymous session when it restarts. Set both
for a stable local setup:

```bash
export LABGUIDE_COOKIE_SECRET=$(openssl rand -hex 32)
export LABGUIDE_VAULT_KEY=$(openssl rand -hex 32)
npm run dev:server
```

Single-process mode: `npm run build` then `npm run start -w @labguide/server`. The server serves
`packages/web/dist` when it exists (add `http://localhost:8787` to the allowed origins, which is
the default).

## Checks

```bash
npm test                      # shared rule-engine unit tests + server API tests (vitest, supertest)
npm run typecheck             # all three packages
npm run build                 # type-checks and builds the web bundle
npm run check:bundle-secrets  # scans packages/web/dist for secret names, key patterns and provider URLs
node scripts/e2e-journey.mjs --out /tmp/shots   # full keyboard-only journey, desktop + phone
```

The e2e script needs both dev servers running. Options: `--only desktop|mobile`, `--headed`,
`--slow <ms>`, `DEBUG=1`. It writes screenshots, exported files and `e2e-results.json` to `--out`.

## Deploy to Vercel

The app deploys as one Vercel project: the web app is served as static files and the Express
API runs as one serverless function under `/api`. `npm run vercel-build` builds both into
`.vercel/output` (Vercel Build Output API) and then runs `check:bundle-secrets`. It stays in
Demo mode: no provider keys are needed and no provider is ever called.

In Vercel, choose Add New, Project and import the `LabGuide_AI` repository. Project settings
(most come from `vercel.json`):

| Setting | Value |
| --- | --- |
| Repository / branch | `LabGuide_AI`, production branch `main` |
| Root Directory | Leave at the default (the repository root) |
| Framework Preset | Other |
| Install / Build command | `npm ci` / `npm run vercel-build` (set by `vercel.json`) |

Public link: new Vercel projects require a Vercel login to open any deployment. To let
students open the link, go to Settings, Deployment Protection and turn off
**Vercel Authentication** (or call the REST API with `{"ssoProtection": null}`).

Storage: Vercel has no persistent disk, so add **Upstash for Redis** from the Vercel
Marketplace (Storage tab, Create Database, Upstash, Redis) and connect it to the project. It sets
`KV_REST_API_URL` and `KV_REST_API_TOKEN` (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
also work). Keep the default environment-variable prefix. Students' data, rate limits and the
Poe connection state then live in Redis, and each student's record expires 30 days after
their last activity (Redis TTL). Without these variables the app uses the local JSON file store.

Environment variables (Settings, Environment Variables):

| Variable | Value |
| --- | --- |
| `LABGUIDE_COOKIE_SECRET` | Required. A random string of at least 32 characters |
| `LABGUIDE_VAULT_KEY` | Required. A different random string of at least 32 characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Set automatically by the Upstash integration |
| `LABGUIDE_PUBLIC_ORIGIN` | Optional. Extra origin allowed by CORS, e.g. `https://labguide.school.example` |

Generate each secret with `openssl rand -hex 32` (macOS/Linux Terminal), or in any browser
press F12, open Console and run:

```js
[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
```

If a required value is missing, every `/api` request returns `500 server_misconfigured`
listing what is missing (variable names only). Secrets are never generated in production.
The deployment's own `*.vercel.app` URLs and its custom domains are allowed automatically
(same-origin). Other origins are still rejected.

Local check of the Vercel build: `npm run vercel-build`, then look at `.vercel/output`.

## Layout

```
packages/shared   Types, apparatus catalog (SVG), deterministic rule engine, scene helpers
  src/rules/plan.ts      Plan validation, stage unlocking
  src/rules/hazards.ts   Hazard detection (negation-aware), conditional safety checklist
  src/rules/diagram.ts   Diagram safety blocks, consistency hints, completeness checks
  src/scene.ts           Containment, connections, sanitizeScene (server-side schema check)
packages/server   Express API, JSON file store, auth, security, provider adapters
  src/app.ts             All routes
  src/providers/         demo.ts, poe.ts, gemini.ts, registry.ts, schema.ts
  src/vault.ts           AES-256-GCM encryption for provider tokens
  src/security.ts        Signed cookies, CSRF, CORS allowlist, rate limits
packages/web      React 18 + Vite frontend
  src/pages/stages/      The seven plan stages
  src/pages/diagram/     Method choice, canvas editor, result/export
  src/canvas/            SVG rendering, label layout, undo/redo, PNG/PDF export
scripts/          e2e-journey.mjs, check-bundle-secrets.mjs, find-overflow.mjs
```

The rule engine runs in both places: the browser uses it for instant feedback, and the server
re-runs it on every save. The server is authoritative. It refuses to unlock a later stage or
the diagram stage while a safety block is open (HTTP 409).

## Where the real Poe and Gemini adapters plug in

Every provider implements `TutorProvider` (`packages/server/src/providers/types.ts`):
`sendTurn`, `reviewPlan`, `health`. `ProviderRegistry` (`providers/registry.ts`) picks the
active provider from server config only (the browser can never choose a provider, model, URL
or system prompt). It wraps every call with a timeout, bounded retries and
`validateTutorDraft()` (`providers/schema.ts`), which strips markup and caps each reply at
three questions. If the chosen real provider is not configured, it stays in Demo mode.

### Poe (student-connected, OAuth)

File: `packages/server/src/providers/poe.ts`. The TODO block there lists the steps:

1. Register the app with Poe. Set `POE_CLIENT_ID`, `POE_CLIENT_SECRET` and `POE_REDIRECT_URI`
   (the exact registered callback, e.g. `https://<host>/api/connect/poe/callback`) in the
   server's secret store. Optionally set `POE_MODEL`.
2. Fill in the authorize, token and revoke URLs from Poe's official documentation.
3. `buildAuthorizeUrl()`: Authorization Code + PKCE (S256). `createPkcePair()` and
   `createOAuthState()` already exist. The `/api/connect/poe/start` route stores the state and
   verifier per student with a 10-minute expiry.
4. `exchangeCode()`: a server-side token exchange. Store tokens only through `Vault.encrypt()`,
   and never log them or send them to the browser.
5. `sendTurn()`: decrypt the student's token on the server, call the allowlisted model with the
   server-owned system prompt, and return a `TutorDraft`.
6. `revoke()`: call Poe's revoke endpoint, then delete the encrypted record (the
   `/api/connect/poe/disconnect` route already deletes it).

Until then, `/api/connect/poe/start` runs a **simulated** flow (labelled Demo mode). It
redirects straight back to its own callback and never contacts Poe.

### Gemini (school-managed API key)

File: `packages/server/src/providers/gemini.ts`. Set `GEMINI_API_KEY` (and optionally
`GEMINI_MODEL`) on the server. Then implement `sendTurn()` / `reviewPlan()` with the official
Gemini API client, using the `AbortSignal` passed in. Students never sign in to Gemini or paste
keys. The Settings page shows Gemini as "managed by your school".

### Choosing the active provider

Set `LABGUIDE_PROVIDER=demo|poe|gemini`, or change it at runtime through the admin API (below).
Real providers are only used when configured. Otherwise the app stays in Demo mode and says so.

## Environment variables (server only)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 8787) |
| `LABGUIDE_ALLOWED_ORIGINS` | Comma-separated exact CORS origins (localhost defaults only outside production) |
| `LABGUIDE_PUBLIC_ORIGIN` | One extra allowed origin (e.g. a custom domain) |
| `LABGUIDE_COOKIE_SECRET` | Signs the anonymous student cookie (required in production) |
| `LABGUIDE_VAULT_KEY` | 32-byte hex key for AES-256-GCM token encryption (required in production) |
| `LABGUIDE_ADMIN_TOKEN` | Bearer token for `/api/admin/*` (admin API is disabled, 404, if unset) |
| `LABGUIDE_SECURE_COOKIES` | `true` behind HTTPS |
| `LABGUIDE_DATA_DIR` | File store location (default `packages/server/data`) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Use Upstash Redis instead of the file store |
| `LABGUIDE_DAILY_TURN_BUDGET` | Tutor turns per student per day (default 300) |
| `LABGUIDE_PROVIDER` | `demo` (default), `poe`, `gemini` |
| `POE_CLIENT_ID`, `POE_CLIENT_SECRET`, `POE_REDIRECT_URI`, `POE_MODEL` | Poe OAuth app |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini API |

None of these reach the browser bundle. `npm run check:bundle-secrets` verifies that.

## Admin API

All admin routes require `Authorization: Bearer $LABGUIDE_ADMIN_TOKEN`. Without the token they
return 404.

- `GET /api/admin/provider-config`: the active provider and whether each one is configured (no secrets)
- `PUT /api/admin/provider-config` `{ "active": "demo" | "poe" | "gemini" }`
- `POST /api/admin/provider-test`: health check of the active provider (demo returns OK without a request)

## Security and privacy notes

- Students are anonymous. A signed httpOnly `SameSite=Strict` cookie identifies them. No names,
  emails or school IDs are collected. A nickname (max 24 characters) is optional.
- CSRF: double-submit token (`lg_csrf` cookie plus `x-csrf-token` header) on all state-changing routes.
- CORS: exact-origin allowlist, credentials only for allowed origins. helmet sets a strict CSP.
- Rate limits: token buckets per IP, per student and per chat, plus a daily turn budget. Request bodies are limited to 100 kB.
- Ownership checks on every session and diagram route. A missing or foreign resource gets 404.
- Logs are redacted: no chat text, plan text, cookies or tokens.
- Retention: sessions, diagrams and chats are purged 30 days after last activity (checked hourly
  and at boot). Students can delete a session (Welcome page), a diagram version (Result page)
  or all their data (Settings).
- Diagram scenes are schema-checked and sanitised on the server (`sanitizeScene`). Free text is stripped of markup.
- Uploading a photo of a hand-drawn diagram is shown as a disabled "Coming soon" option. No
  upload endpoint or file input exists. A TODO in `app.ts` marks where it would go.

## Simplifications in this prototype

- Local dev uses a JSON file store with atomic writes and in-memory rate limits. With Upstash Redis (Vercel) each student is one JSON document with a 30-day TTL, and requests for one student are serialised with a short lock. Rate limits are then fixed windows shared by all instances.
- TLS is expected from a reverse proxy (`LABGUIDE_SECURE_COOKIES=true`).
- Poe and Gemini network calls are not implemented (stubs throw `not_configured`).
- Canvas rotation is in 90° steps. Main labels are auto-placed in the margins; extra labels are draggable. No pinch-zoom (zoom buttons and fit-to-view instead).
- A "Boiling tube of ethanol" apparatus item was added so the ethanol-near-flame canvas block can be shown.
- Missing gloves or tongs near hot glassware is a completeness hint on the canvas, not a block.
