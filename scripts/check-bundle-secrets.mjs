#!/usr/bin/env node
// Fails if the built frontend bundle contains provider secrets, secret env names or provider endpoints.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../packages/web/dist/', import.meta.url).pathname;
if (!existsSync(dist)) {
  console.error('packages/web/dist not found. Run `npm run build` first.');
  process.exit(2);
}

const patterns = [
  /POE_CLIENT_SECRET/,
  /POE_CLIENT_ID/,
  /GEMINI_API_KEY/,
  /LABGUIDE_(VAULT_KEY|COOKIE_SECRET|ADMIN_TOKEN)/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /generativelanguage\.googleapis\.com/,
  /api\.poe\.com/,
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
];

const envSecrets = ['POE_CLIENT_SECRET', 'GEMINI_API_KEY', 'LABGUIDE_VAULT_KEY', 'LABGUIDE_COOKIE_SECRET', 'LABGUIDE_ADMIN_TOKEN']
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 8);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let failures = 0;
const files = walk(dist).filter((f) => /\.(js|css|html|map|json|txt)$/.test(f));
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const re of patterns) {
    if (re.test(text)) {
      console.error(`FAIL ${file.replace(dist, 'dist/')}: matches ${re}`);
      failures++;
    }
  }
  for (const value of envSecrets) {
    if (text.includes(value)) {
      console.error(`FAIL ${file.replace(dist, 'dist/')}: contains the value of a secret environment variable`);
      failures++;
    }
  }
}

if (failures) process.exit(1);
console.log(`OK: scanned ${files.length} bundle files, no secrets or provider endpoints found.`);
