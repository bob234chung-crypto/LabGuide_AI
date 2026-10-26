// Keyboard-only end-to-end journey for LabGuide AI (desktop + phone viewports).
// Usage: node scripts/e2e-journey.mjs [--base http://localhost:5173] [--out ./screenshots] [--headed] [--slow 0] [--only desktop|mobile]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const BASE = args.base ?? 'http://localhost:5173';
const OUT = path.resolve(args.out ?? './screenshots');
const CHROME = process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run(kind) {
  const mobile = kind === 'mobile';
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: !args.headed,
    slowMo: Number(args.slow ?? 0),
    args: args.headed ? [`--window-size=${mobile ? '430,932' : '1440,960'}`, '--window-position=0,0'] : [],
  });
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  currentPage = page;
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  if (process.env.DEBUG) page.on('console', (m) => console.log('  [console]', m.type(), m.text().slice(0, 300)));
  const shot = async (name) => {
    await page.waitForTimeout(250);
    if (mobile) {
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${name}: no horizontal overflow on phone`, o <= 1, `${o}px`);
    }
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };
  const key = async (loc, ...keys) => {
    await loc.focus();
    for (const k of keys) await page.keyboard.press(k);
  };
  const typeInto = async (loc, text) => {
    await loc.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text, { delay: 2 });
  };
  const next = async () => {
    const btn = page.getByRole('button', { name: /^Next:/ });
    await btn.waitFor();
    await page.waitForFunction(() => !document.querySelector('.stage-footer .btn-primary')?.hasAttribute('disabled'), null, { timeout: 5000 });
    await key(btn, 'Enter');
  };
  const waitSaved = () => page.waitForSelector('.save-indicator[data-state="saved"]', { timeout: 8000 });
  const tutorScope = async () => {
    if (!mobile) return page.locator('.tutor-desktop');
    if (!(await page.locator('.drawer').count())) await key(page.getByRole('button', { name: 'Tutor' }), 'Enter');
    return page.locator('.drawer');
  };
  const closeTutor = async () => {
    if (mobile && (await page.locator('.drawer').count())) await page.keyboard.press('Escape');
  };
  const p = mobile ? 'mobile' : 'desktop';

  /* ---------- Welcome ---------- */
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Plan a fair science investigation/ }).waitFor();
  check(`${p}: Demo mode badge in header`, await page.locator('.topbar .badge-demo').isVisible());
  await shot(`${p}-01-welcome`);

  // Tab from the top reaches the main start button (keyboard-only start).
  await page.keyboard.press('Tab');
  let reached = false;
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (/Start a new investigation/.test(t)) {
      reached = true;
      break;
    }
    await page.keyboard.press('Tab');
  }
  check(`${p}: Tab reaches "Start a new investigation"`, reached);
  await page.keyboard.press('Enter');

  /* ---------- 1 Theme ---------- */
  await page.waitForURL(/\/theme$/);
  const sessionUrl = page.url().replace(/\/theme$/, '');
  const radio = page.getByRole('radio', { name: /Factors affecting rate of photosynthesis/ });
  await key(radio, 'Space');
  check(`${p}: theme chosen with keyboard`, (await radio.getAttribute('aria-checked')) === 'true');
  const tutor0 = await tutorScope();
  await tutor0.locator('.msg-tutor').first().waitFor();
  check(`${p}: tutor greeting shows Demo mode badge`, await tutor0.locator('.msg-tutor .badge-demo').first().isVisible());
  await closeTutor();
  await next();

  /* ---------- 2 Hypothesis ---------- */
  await page.waitForURL(/\/hypothesis$/);
  const hyp = page.locator('#hyp');
  await typeInto(hyp, 'Plants like light');
  await page.waitForSelector('.issue-hint');
  check(`${p}: weak hypothesis gets an amber hint`, await page.locator('.issue-hint').first().isVisible());
  check(`${p}: Next disabled while hypothesis invalid`, await page.getByRole('button', { name: /^Next:/ }).isDisabled());
  const tutor1 = await tutorScope();
  for (let i = 0; i < 3; i++) {
    const hintBtn = tutor1.getByRole('button', { name: /Get hint/ });
    await key(hintBtn, 'Enter');
    await tutor1.locator(`.msg-hint`).nth(i).waitFor();
  }
  const hint3 = await tutor1.locator('.msg-hint').nth(2).innerText();
  check(`${p}: hint 3 is a worked example on a different topic`, /Hint 3 of 3/.test(hint3) && /different topic/.test(hint3));
  await closeTutor();
  await typeInto(hyp, 'If the lamp is closer to the pondweed, then more oxygen bubbles will be produced per minute.');
  await waitSaved();
  // Refresh keeps work.
  await page.reload();
  await page.locator('#hyp').waitFor();
  check(`${p}: refresh keeps the hypothesis`, /lamp is closer/.test(await page.locator('#hyp').inputValue()));
  const tutor2 = await tutorScope();
  await key(tutor2.getByRole('button', { name: 'Check my work' }), 'Enter');
  await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .msg-tutor`).length >= 5, mobile ? '.drawer' : '.tutor-desktop');
  if (!mobile) await shot(`${p}-02-stage-with-tutor`);
  else await shot(`${p}-02-tutor-drawer`);
  const qCounts = await tutor2.locator('.msg-tutor').evaluateAll((els) =>
    els.map((e) => e.querySelectorAll('li').length + ((e.querySelector('p')?.textContent ?? '').match(/\?/g) ?? []).length),
  );
  check(`${p}: every tutor reply asks at most 3 questions`, qCounts.every((n) => n <= 3), `counts ${qCounts.join(',')}`);
  await closeTutor();
  await next();

  /* ---------- 3 Variables ---------- */
  await page.waitForURL(/\/variables$/);
  await typeInto(page.locator('#iv'), 'Distance of the lamp from the pondweed (cm)');
  await typeInto(page.locator('#dv'), 'Number of oxygen bubbles per minute');
  const cvs = page.locator('input[id^="cv-"]');
  await typeInto(cvs.nth(0), 'Temperature of the water');
  await typeInto(cvs.nth(1), 'Concentration of sodium hydrogencarbonate solution');
  await key(page.getByRole('button', { name: 'Add a controlled variable' }), 'Enter');
  await page.waitForTimeout(100);
  await page.keyboard.type('Same piece of pondweed');
  await next();

  /* ---------- 4 Apparatus ---------- */
  await page.waitForURL(/\/apparatus$/);
  await page.locator('.app-tile').first().waitFor();
  for (const name of ['Pondweed', 'Boiling tube', 'Beaker', 'Lamp', 'Metre rule', 'Thermometer', 'Stopwatch', 'Safety goggles']) {
    await key(page.locator('.app-tile', { hasText: new RegExp(`^${name}`) }).first(), 'Space');
  }
  await typeInto(page.locator('#just-metre-rule'), 'To measure the distance from the lamp precisely in cm.');
  await typeInto(page.locator('#just-thermometer'), 'To check the water temperature stays the same because it is a controlled variable.');
  await typeInto(page.locator('#just-stopwatch'), 'To time exactly one minute for each count.');
  await next();

  /* ---------- 5 Procedure (with an unsafe step) ---------- */
  await page.waitForURL(/\/procedure$/);
  const steps = [
    'Put the pondweed in a boiling tube of sodium hydrogencarbonate solution.',
    'Place the lamp 10 cm away, measured with the metre rule.',
    'Count and record the bubbles for one minute.',
    'Repeat three times at each distance and find the average.',
  ];
  await typeInto(page.locator('textarea[id^="step-"]').first(), steps[0]);
  for (const s of steps.slice(1)) {
    await key(page.getByRole('button', { name: 'Add a step' }), 'Enter');
    await page.waitForTimeout(80);
    await page.keyboard.type(s, { delay: 1 });
  }
  // Reorder with keyboard: move step 4 up, then back down.
  await key(page.getByRole('button', { name: 'Move step 4 up' }), 'Enter');
  const third = await page.locator('textarea[id^="step-"]').nth(2).inputValue();
  check(`${p}: keyboard reorder moves a step`, /Repeat three times/.test(third));
  await key(page.getByRole('button', { name: 'Move step 3 down' }), 'Enter');
  await key(page.getByRole('button', { name: 'Add a step' }), 'Enter');
  await page.waitForTimeout(80);
  await page.keyboard.type('To test for starch, heat the leaf in ethanol over a Bunsen burner.', { delay: 1 });
  await page.locator('.safety-block').first().waitFor();
  const blockText = await page.locator('.safety-block').first().innerText();
  check(`${p}: plan safety block for heating ethanol with a flame`, /Do not heat ethanol/.test(blockText) && /water bath/.test(blockText));
  check(`${p}: Next is disabled by the safety block`, await page.getByRole('button', { name: /^Next:/ }).isDisabled());
  const color = await page.locator('.safety-block').first().evaluate((e) => getComputedStyle(e).borderTopColor);
  check(`${p}: safety block is red`, color === 'rgb(179, 38, 30)', color);
  await waitSaved();
  const serverLock = await page.evaluate(async (url) => {
    const id = url.split('/s/')[1];
    const csrf = document.cookie.match(/lg_csrf=([^;]+)/)?.[1] ?? '';
    const r = await fetch(`/api/sessions/${id}/progress`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ currentStage: 'safety' }),
    });
    return r.status;
  }, sessionUrl);
  check(`${p}: server refuses to advance past the unsafe plan`, serverLock === 409, `HTTP ${serverLock}`);
  const tutor3 = await tutorScope();
  await key(tutor3.getByRole('button', { name: 'Check my work' }), 'Enter');
  await tutor3.locator('.msg-safety').first().waitFor();
  check(`${p}: tutor gives a red safety message`, /Do not heat ethanol/.test(await tutor3.locator('.msg-safety').first().innerText()));
  await closeTutor();
  await page.locator('.safety-block').first().scrollIntoViewIfNeeded();
  await shot(`${p}-03-safety-block-plan`);
  await typeInto(page.locator('textarea[id^="step-"]').nth(4), 'To test for starch, turn off the Bunsen burner, then warm the leaf in ethanol in a hot water bath.');
  await page.waitForFunction(() => !document.querySelector('.safety-block'));
  check(`${p}: safety block clears after revising the step`, (await page.locator('.safety-block').count()) === 0);
  await next();

  /* ---------- 6 Safety ---------- */
  await page.waitForURL(/\/safety$/);
  const boxes = page.locator('fieldset input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await key(boxes.nth(i), 'Space');
  check(`${p}: conditional checklist items added (heat + ethanol)`, n >= 7, `${n} items`);
  await next();

  /* ---------- 7 Summary ---------- */
  await page.waitForURL(/\/summary$/);
  const gen = page.getByRole('button', { name: 'Generate Sectional Diagram' });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Generate Sectional Diagram'));
    return b && !b.disabled;
  });
  check(`${p}: Generate Sectional Diagram enabled after validation`, await gen.isEnabled());
  if (!mobile) await shot(`${p}-04-plan-summary`);
  await key(gen, 'Enter');

  /* ---------- Diagram method ---------- */
  await page.waitForURL(/\/diagram$/);
  const photo = page.locator('[aria-disabled="true"]', { hasText: 'Upload a photo' });
  check(`${p}: photo option visible and disabled`, (await photo.isVisible()) && /Coming soon/.test(await photo.innerText()) && /Photo upload will be added later\./.test(await photo.innerText()));
  check(`${p}: no file input or camera capture anywhere`, (await page.locator('input[type="file"], [capture]').count()) === 0);
  await shot(`${p}-05-diagram-method`);
  await key(page.getByRole('button', { name: /Build on canvas/ }), 'Enter');

  /* ---------- Canvas (keyboard only) ---------- */
  await page.waitForURL(/\/diagram\/canvas$/);
  await page.locator('svg.stage').waitFor();
  const openSheet = async (tab) => {
    if (!mobile) return;
    await key(page.getByRole('tab', { name: new RegExp(`^${tab}`) }), 'Enter');
  };
  const itemIds = async () => page.locator('g.canvas-item[id^="ci-"]').evaluateAll((els) => els.map((e) => e.id.slice(3)));
  const add = async (name) => {
    await openSheet('Apparatus');
    const before = await itemIds();
    const trayBtn = page.getByRole('button', { name: new RegExp(`^${name}\\. Select`) }).first();
    await key(trayBtn, 'Enter');
    await key(page.getByRole('button', { name: new RegExp(`^Add ${name.toLowerCase()} to canvas`) }), 'Enter');
    if (process.env.DEBUG) console.log('  add', name);
    await page.waitForFunction((c) => document.querySelectorAll('g.canvas-item[id^="ci-"]').length > c, before.length);
    const after = await itemIds();
    const id = after.find((x) => !before.includes(x));
    await page.waitForFunction((x) => document.activeElement?.id === `ci-${x}`, id);
    return id;
  };
  const placeIn = async (childId, containerText) => {
    await openSheet('Placed');
    const sel = page.locator(`#in-${childId}`);
    const opts = await sel.locator('option').allInnerTexts();
    const target = opts.findIndex((o) => o.includes(containerText));
    const cur = await sel.evaluate((s) => s.selectedIndex);
    await sel.focus();
    for (let i = cur; i < target; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    return (await sel.inputValue()) !== '';
  };
  const moveKeys = async (id, keys) => {
    await page.locator(`#ci-${id}`).focus();
    for (const k of keys) await page.keyboard.press(k);
  };

  const beaker = await add('Beaker');
  await page.waitForTimeout(120);
  check(`${p}: item added with keyboard and focused`, await page.evaluate((id) => document.activeElement?.id === `ci-${id}`, beaker));
  await moveKeys(beaker, ['Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight']);
  const tube = await add('Boiling tube');
  const placedTube = await placeIn(tube, 'Beaker');
  const live = await page.locator('[aria-live="polite"].sr-only').allInnerTexts();
  check(`${p}: "Place inside…" puts boiling tube in beaker + live announcement`, placedTube && live.some((t) => /Boiling tube placed inside beaker/i.test(t)), live.join(' | '));
  const weed = await add('Pondweed');
  await placeIn(weed, 'Boiling tube');
  const thermo = await add('Thermometer');
  await placeIn(thermo, 'Beaker');
  const lamp = await add('Lamp');
  await add('Metre rule');
  await add('Stopwatch');
  await add('Safety goggles');

  // Canvas safety: ethanol above a Bunsen burner.
  const burner = await add('Bunsen burner');
  const ethanol = await add('Boiling tube of ethanol');
  const pos = await page.evaluate(
    ([a, b]) => {
      const box = (id) => {
        const r = document.getElementById(`ci-${id}`).querySelector('rect').getBBox();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { a: box(a), b: box(b) };
    },
    [ethanol, burner],
  );
  const dx = Math.round((pos.b.x + pos.b.width / 2 - (pos.a.x + pos.a.width / 2)) / 10);
  const moves = [];
  for (let i = 0; i < Math.abs(dx); i++) moves.push(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
  for (let i = 0; i < 4; i++) moves.push('Shift+ArrowUp');
  if (process.env.DEBUG) console.log('  ethanol move', JSON.stringify(pos), dx);
  await moveKeys(ethanol, moves);
  await page.waitForFunction(() => /heats ethanol over a Bunsen burner/.test(document.body.innerText), null, { timeout: 8000 });
  check(`${p}: canvas safety block for ethanol above a flame`, true);
  if (mobile) {
    await openSheet('Checks');
    await page.locator('.sheet .safety-block').first().waitFor();
    await shot(`${p}-07-canvas-safety-block`);
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(`${p}-07-canvas-safety-block-canvas`);
    await page.locator('#checks-h').scrollIntoViewIfNeeded();
    await shot(`${p}-07-canvas-safety-block`);
  }
  // Fix: remove the burner, put the ethanol in a beaker of hot water.
  await moveKeys(burner, ['Delete']);
  const bath = await add('Beaker');
  await openSheet('Placed');
  await typeInto(page.locator(`#placed-${bath}`), 'Beaker of hot water');
  await placeIn(ethanol, 'Beaker of hot water');
  await openSheet('Placed');
  await typeInto(page.locator(`#placed-${ethanol}`), 'Ethanol');
  // Extra leader-line label on the beaker.
  await key(page.getByRole('button', { name: /^Add a label line to Beaker$/ }), 'Enter');
  const extraLabel = page.locator('input[id^="lab-"]').first();
  await typeInto(extraLabel, 'Water (heat shield)');
  await page.waitForFunction(() => !/heats ethanol over a Bunsen burner/.test(document.body.innerText), null, { timeout: 8000 });
  await waitSaved();
  check(`${p}: canvas safety block clears after fixing`, true);
  // Undo / redo by keyboard.
  const count1 = (await itemIds()).length;
  await page.locator(`#ci-${lamp}`).focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  check(`${p}: undo/redo keeps the scene`, (await itemIds()).length === count1);
  await key(page.getByRole('button', { name: 'Fit to screen' }), 'Enter');
  await waitSaved();
  await page.locator('svg.stage').scrollIntoViewIfNeeded();
  if (mobile) {
    await openSheet('Apparatus');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await shot(`${p}-06-canvas-editor`);

  // Refresh keeps canvas work.
  await page.reload();
  await page.locator('svg.stage').waitFor();
  await page.waitForTimeout(500);
  check(`${p}: refresh keeps the canvas`, (await itemIds()).length === count1, `${count1} items`);

  /* ---------- Result + export ---------- */
  await key(page.getByRole('button', { name: 'Generate labelled diagram' }), 'Enter');
  await page.waitForURL(/\/diagram\/result$/);
  await page.locator('svg.result-svg').waitFor();
  await page.waitForTimeout(300);
  await shot(`${p}-08-result`);
  const [dl] = await Promise.all([page.waitForEvent('download'), key(page.getByRole('button', { name: 'Export PNG' }), 'Enter')]);
  await dl.saveAs(path.join(OUT, `${p}-09-exported-diagram.png`));
  check(`${p}: PNG export downloaded`, fs.statSync(path.join(OUT, `${p}-09-exported-diagram.png`)).size > 10000);
  const [dl2] = await Promise.all([page.waitForEvent('download'), key(page.getByRole('button', { name: 'Export PDF' }), 'Enter')]);
  await dl2.saveAs(path.join(OUT, `${p}-exported-diagram.pdf`));
  check(`${p}: PDF export downloaded`, fs.statSync(path.join(OUT, `${p}-exported-diagram.pdf`)).size > 5000);
  await key(page.getByRole('button', { name: 'Save version' }), 'Enter');
  await page.getByRole('button', { name: 'View version 1' }).waitFor();
  check(`${p}: version saved and listed`, true);
  await key(page.getByRole('button', { name: 'Submit diagram' }), 'Enter');
  await page.getByText('Diagram submitted').waitFor();
  check(`${p}: diagram submitted when no safety block`, true);

  /* ---------- Resume from welcome ---------- */
  await page.goto(BASE);
  const resume = page.getByRole('link', { name: /^Resume Factors/ }).first();
  await resume.waitFor();
  await key(resume, 'Enter');
  await page.waitForURL(/\/s\/.+\/diagram/);
  check(`${p}: resume from welcome returns to the diagram`, true);

  /* ---------- Settings ---------- */
  await page.goto(`${BASE}/settings`);
  await page.getByRole('heading', { name: 'Poe' }).waitFor();
  const body = await page.locator('main').innerText();
  check(`${p}: no false "Connected" status`, !/(^|\W)Connected(\W|$)/.test(body.replace(/Not connected|no real connection|Simulated connection/gi, '')));
  check(`${p}: Gemini shown as school-managed, no connect button`, /Managed by your school \/ app administrator/.test(body) && (await page.getByRole('button', { name: /Connect Gemini/i }).count()) === 0);
  await key(page.getByRole('button', { name: /^Connect Poe/ }), 'Enter');
  const cont = page.getByRole('button', { name: /Continue \(simulated\)/ });
  check(`${p}: consent required before connecting`, await cont.isDisabled());
  await key(page.locator('dialog[open] input[type="checkbox"]'), 'Space');
  await key(page.getByRole('link', { name: /Continue \(simulated\)/ }), 'Enter');
  await page.waitForURL(/poe=demo_connected/);
  await page.getByText('Simulated connection – Demo mode – no real connection').waitFor();
  check(`${p}: simulated Poe connection labelled Demo mode`, true);
  await shot(`${p}-10-settings`);
  await key(page.getByRole('button', { name: 'Disconnect Poe' }), 'Enter');
  await page.getByText('Not connected – Demo mode – no real connection').waitFor();
  check(`${p}: disconnect works`, true);

  check(`${p}: no uncaught page errors`, consoleErrors.length === 0, consoleErrors.join(' | '));
  await browser.close();
}

let currentPage = null;
const only = args.only;
for (const k of ['desktop', 'mobile']) {
  if (only && only !== k) continue;
  try {
    await run(k);
  } catch (e) {
    check(`${k}: journey completed without error`, false, String(e).split('\n')[0]);
    if (process.env.DEBUG) console.log(await currentPage?.evaluate(() => ({ n: document.querySelectorAll('g.canvas-item[id^="ci-"]').length, active: document.activeElement?.outerHTML.slice(0, 200), live: [...document.querySelectorAll('.sr-only[aria-live]')].map((e) => e.textContent) })).catch((e) => String(e)));
    await currentPage?.screenshot({ path: path.join(OUT, `${k}-FAILURE.png`) }).catch(() => {});
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
