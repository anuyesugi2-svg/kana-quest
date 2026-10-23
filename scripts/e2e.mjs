// End-to-end walkthrough at phone size, driven through the real UI.
// Usage: start `npx vite --port 5199` then `node scripts/e2e.mjs [screenshotDir]`.
// Needs Edge or Chrome installed (set BROWSER=path to override).
// It plays through hiragana (failing the boss once to test the drill), katakana, and into N5.

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199/';
const OUT = process.argv[2] ?? 'e2e-shots';
mkdirSync(OUT, { recursive: true });
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const errors = [];
const overflow = [];
let shotN = 0;

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name) {
  const file = join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  if (o.sw > o.w) overflow.push(`${name}: scrollWidth ${o.sw} > ${o.w}`);
}

async function nav(hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await sleep(250);
}

async function waitFor(fn, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(40);
  }
  await page.screenshot({ path: join(OUT, 'timeout.png') });
  throw new Error(`timeout waiting for ${fn}`);
}

/** Answer the current question. `right` = answer correctly. */
async function answer(right, speed = false) {
  const q = await page.evaluate(() => window.__kqQuestion);
  const a = q.answer;
  if (a.t === 'choice') {
    const idx = right ? a.correct : (a.correct + 1) % a.options.length;
    const btns = await page.$$('.choice');
    await btns[idx].click();
  } else if (a.t === 'romaji' || a.t === 'kana' || a.t === 'meaning') {
    let text = 'zzzq';
    if (right) {
      if (a.t === 'meaning') text = a.meanings[0].split(';')[0].replace(/\([^)]*\)/g, '').trim();
      else text = (q.reveal.romaji ?? '').replace(/\s*\(.*\)/, '');
    }
    await page.type('.answer-input', text, { delay: 5 });
    await page.click('form button[type=submit]');
  } else if (a.t === 'tiles') {
    const plain = (f) => f.replace(/\[([^\]|]+)(\|[^\]]*)?\]/g, '$1').replace(/[_ ]/g, '');
    const order = right ? a.answer.map(plain) : [...a.answer].reverse().map(plain);
    for (const want of order) {
      await page.evaluate((w) => {
        const bank = [...document.querySelectorAll('.tiles:not(.answer-row) .tile')];
        bank.find((b) => b.textContent === w && !b.disabled)?.click();
      }, want);
      await sleep(30);
    }
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Check')?.click());
  } else if (a.t === 'trace') {
    // Draw each stroke along the reference path (or a wrong scribble).
    const strokes = await page.evaluate((ch) => {
      const paths = window.__kqState.strokes[ch];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.appendChild(svg);
      const out = paths.map((d) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
        const L = p.getTotalLength();
        return Array.from({ length: 16 }, (_, i) => {
          const pt = p.getPointAtLength((L * i) / 15);
          return [pt.x, pt.y];
        });
      });
      svg.remove();
      const r = document.querySelector('.trace-wrap').getBoundingClientRect();
      return { out, r: { x: r.left, y: r.top, w: r.width, h: r.height } };
    }, a.char);
    const { r } = strokes;
    const map = ([x, y]) => [r.x + (x / 109) * r.w, r.y + (y / 109) * r.h];
    // Wrong: draw each stroke backwards three times (the canvas then shows it and moves on).
    const list = right ? strokes.out : strokes.out.flatMap((s) => [s, s, s].map((x) => [...x].reverse()));
    for (const s of list) {
      const pts = s.map(map);
      await page.mouse.move(...pts[0]);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 2 });
      await page.mouse.up();
      await sleep(40);
      if (await page.evaluate(() => !!document.querySelector('.feedback'))) break;
    }
  }
  if (!speed) await waitFor(() => !!document.querySelector('.feedback') || !!document.querySelector('.result-hero'));
}

/** Play a whole session. `wrongEvery`: answer every Nth scored question wrong. */
async function playSession(hash, { wrongEvery = 0, shots = false } = {}) {
  await page.evaluate(() => (window.__kqQuestion = null));
  await nav('/');
  await nav(hash);
  await waitFor(() => !!window.__kqQuestion || !!document.querySelector('.result-hero') || /No reviews|empty/.test(document.body.innerText));
  let n = 0;
  let shotTypes = new Set();
  for (let guard = 0; guard < 200; guard++) {
    if (await page.evaluate(() => !!document.querySelector('.result-hero'))) break;
    const q = await page.evaluate(() => window.__kqQuestion);
    n++;
    const right = !(wrongEvery && n % wrongEvery === 0);
    if (shots && !shotTypes.has(q.answer.t)) {
      shotTypes.add(q.answer.t);
      await shot(`q-${q.answer.t}-${q.mode}`);
    }
    await answer(right);
    if (shots && !right && !shotTypes.has('feedback-wrong')) {
      shotTypes.add('feedback-wrong');
      await shot('feedback-wrong');
    }
    // DOM click: the feedback panel is still sliding in, so a mouse click can miss.
    await page.evaluate(() => document.querySelector('.feedback .btn.block')?.click());
    await waitFor(`window.__kqQuestion?.key !== ${JSON.stringify(q.key)} || !!document.querySelector('.result-hero')`);
  }
  await waitFor(() => !!document.querySelector('.result-hero'));
  const res = await page.evaluate(() => ({
    title: document.querySelector('.result-hero h1')?.textContent,
    score: document.querySelector('.result-hero .score')?.textContent,
  }));
  return res;
}

async function stageUnits(id) {
  return page.evaluate((sid) => window.__kqState.content.stages.find((s) => s.id === sid).units.map((u) => u.id), id);
}

// ---------------------------------------------------------------------------

await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.goto(BASE, { waitUntil: 'networkidle0' });
await waitFor(() => window.__kqState?.content && Object.keys(window.__kqState.strokes).length > 100);
await shot('home-fresh');

// Lesson cards for the first unit
await nav('/unit/h-vowels-k');
await sleep(900);
await shot('lesson-kana');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Try writing/.test(b.textContent))?.click());
await sleep(200);
await shot('lesson-kana-trace');

// Tap-for-romaji on the prompt
const units = await stageUnits('hiragana');
const log = [];
for (const [i, u] of units.entries()) {
  const r = await playSession(`/quiz/unit/${u}`, { shots: i === 0 || i === units.length - 1, wrongEvery: i === 1 ? 4 : 0 });
  log.push(`${u}: ${r.title} ${r.score}`);
  if (i === 0) await shot('unit-results');
  if (i === 1) {
    // Failed on purpose (75%): retry must work and unit 3 must still be locked.
    const locked = await page.evaluate(() => {
      const st = window.__kqState;
      return !st.progress.units['h-s-t']?.passed;
    });
    log.push(`  unit 2 failed as intended, still locked: ${locked}`);
    const r2 = await playSession(`/quiz/unit/${u}`);
    log.push(`  retry: ${r2.title} ${r2.score}`);
  }
}

await nav('/stage/hiragana');
await sleep(300);
await shot('stage-hiragana-all-passed');

// Boss: fail first (answer every 3rd wrong → ~67%), then drill, then pass.
let r = await playSession('/quiz/boss/hiragana', { wrongEvery: 3 });
log.push(`boss attempt 1: ${r.title} ${r.score}`);
await shot('boss-fail-results');
r = await playSession('/quiz/drill/hiragana');
log.push(`drill: ${r.title}`);
r = await playSession('/quiz/boss/hiragana', { wrongEvery: 10 });
log.push(`boss attempt 2: ${r.title} ${r.score}`);
await sleep(400);
await shot('boss-pass-results');

await nav('/map');
await sleep(300);
await shot('map-katakana-unlocked');

// Katakana quickly, then N5.
for (const u of await stageUnits('katakana')) {
  const res = await playSession(`/quiz/unit/${u}`);
  log.push(`${u}: ${res.title} ${res.score}`);
}
r = await playSession('/quiz/boss/katakana');
log.push(`katakana boss: ${r.title} ${r.score}`);

await nav('/stage/n5');
await sleep(400);
await shot('stage-n5');
const n5 = await stageUnits('n5');
await nav(`/unit/${n5[0]}`);
await sleep(500);
await shot('lesson-vocab');
for (const u of n5.slice(0, 3)) {
  const res = await playSession(`/quiz/unit/${u}`, { shots: true });
  log.push(`${u}: ${res.title} ${res.score}`);
}
// Grammar lesson card
const g = n5.find((u) => u.includes('-g'));
await nav(`/unit/${g}`);
await sleep(400);
await shot('lesson-grammar');
await page.evaluate(() => document.querySelector('.example').scrollIntoView({ block: 'center' }));
await sleep(300);
await page.evaluate(() => document.querySelector('.example .jp .seg-k')?.click());
await sleep(250);
await shot('tap-for-romaji-word');
await page.evaluate(() => document.querySelector('.pop-backdrop')?.click());
await page.evaluate(() => [...document.querySelectorAll('.example .jp span')].find((s) => !s.classList.contains('seg-k'))?.click());
await sleep(250);
await shot('tap-for-romaji-sentence');
await page.evaluate(() => document.querySelector('.pop-backdrop')?.click());

// Reviews (force everything due), speed round, notebook, me, settings
await page.evaluate(() => {
  const st = window.__kqState;
  for (const c of Object.values(st.progress.cards)) c.due = Date.now() - 1000;
});
await nav('/');
await sleep(300);
await shot('home-with-reviews');
r = await playSession('/quiz/review', { wrongEvery: 5, shots: true });
log.push(`review: ${r.title}`);
await page.evaluate(() => (window.__kqQuestion = null));
await nav('/quiz/speed');
await waitFor(() => !!window.__kqQuestion);
for (let i = 0; i < 12; i++) {
  const q = await page.evaluate(() => window.__kqQuestion);
  await answer(true, true);
  await waitFor(`window.__kqQuestion?.key !== ${JSON.stringify(q.key)}`);
}
await shot('speed-round-combo');
await nav('/notebook');
await sleep(300);
await shot('notebook');
await nav('/me');
await sleep(300);
await shot('me');
await nav('/settings');
await sleep(300);
await shot('settings');
await nav('/credits');
await sleep(300);
await shot('credits');

// Dark mode check
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await nav('/stage/hiragana');
await sleep(300);
await shot('dark-stage');

// Persistence: reload and confirm progress survived (IndexedDB).
await sleep(600);
await page.reload({ waitUntil: 'networkidle0' });
await waitFor(() => window.__kqState?.loaded);
const persisted = await page.evaluate(() => ({ boss: window.__kqState.progress.bosses, xp: window.__kqState.progress.xpTotal, cards: Object.keys(window.__kqState.progress.cards).length }));
log.push(`after reload: hiragana boss passed=${persisted.boss.hiragana?.passed}, katakana=${persisted.boss.katakana?.passed}, xp=${persisted.xp}, cards=${persisted.cards}`);

console.log(log.join('\n'));
console.log('\nOverflow:', overflow.length ? overflow : 'none');
console.log('Errors:', errors.length ? errors : 'none');
await browser.close();
