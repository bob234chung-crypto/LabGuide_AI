// Reports elements wider than a phone viewport on a given path. Usage: node scripts/find-overflow.mjs /s/<id>/diagram/canvas
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE);
const id = await page.evaluate(async () => {
  await fetch('/api/me');
  const csrf = document.cookie.match(/lg_csrf=([^;]+)/)[1];
  const h = { 'content-type': 'application/json', 'x-csrf-token': csrf };
  const s = await (await fetch('/api/sessions', { method: 'POST', headers: h, body: '{}' })).json();
  return s.session.id;
});
for (const p of ['', `/s/${id}/theme`, `/s/${id}/procedure`, `/settings`]) {
  await page.goto(BASE + p);
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80) + ` right=${Math.round(r.right)}`);
    }
    return { W, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 12) };
  });
  console.log(p || '/', JSON.stringify(res, null, 1));
}
await browser.close();
