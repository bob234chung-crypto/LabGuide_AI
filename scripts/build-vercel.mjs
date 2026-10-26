#!/usr/bin/env node
// Writes .vercel/output (Vercel Build Output API v3): the built web app as static files and
// the Express API bundled into one Node.js function that serves /api/*.
// Run after `npm run build` (see the `vercel-build` script).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}.vercel/output`;
const web = `${root}packages/web/dist`;
const fn = `${out}/functions/api.func`;

if (!existsSync(`${web}/index.html`)) {
  console.error('packages/web/dist not found. Run `npm run build` first.');
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
cpSync(web, `${out}/static`, { recursive: true });

await build({
  entryPoints: [`${root}packages/server/src/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Express and its dependencies are CommonJS and call require() for Node built-ins.
  banner: { js: "import { createRequire as __lgRequire } from 'node:module'; const require = __lgRequire(import.meta.url);" },
  logLevel: 'warning',
});

writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);

const { staticHeaders, PATH_PARAM } = await import(pathToFileURL(`${fn}/index.mjs`).href);

const config = {
  version: 3,
  routes: [
    { src: '^/(?!api(?:/|$)).*$', headers: staticHeaders(), continue: true },
    { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/api(?:/(.*))?$', dest: `/api?${PATH_PARAM}=$1` },
    { src: '^/(.*)$', dest: '/index.html' },
  ],
};
writeFileSync(`${out}/config.json`, JSON.stringify(config, null, 2));
console.log('Wrote .vercel/output (static files + api function).');
