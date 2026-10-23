// Checks the production build is installable and works offline.
// Usage: npm run build && npx vite preview --port 5299 --strictPort, then node scripts/pwa-check.mjs
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5299/';
const executablePath = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle0' });
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel=manifest]');
  if (!link) return null;
  return (await fetch(link.href)).json();
});
console.log('manifest:', manifest ? `${manifest.name}, display=${manifest.display}, icons=${manifest.icons.map((i) => i.sizes + (i.purpose ? '/' + i.purpose : '')).join(' ')}` : 'MISSING');

await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle0' });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
console.log('service worker controlling page:', controlled);

const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  let n = 0;
  const data = [];
  for (const k of keys) {
    const c = await caches.open(k);
    const reqs = await c.keys();
    n += reqs.length;
    data.push(...reqs.map((r) => r.url).filter((u) => u.includes('/data/')));
  }
  return { caches: keys, entries: n, data };
});
console.log(`caches: ${cached.caches.join(', ')} (${cached.entries} entries); data files cached: ${cached.data.length}`);

// Go offline and make sure the app and lesson data still load.
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => (location.hash = '/unit/h-vowels-k'));
await new Promise((r) => setTimeout(r, 1500));
const offline = await page.evaluate(() => ({
  title: document.title,
  lessonShown: !!document.querySelector('.learn-hero'),
  bigChar: document.querySelector('.learn-hero .big')?.textContent,
  error: document.querySelector('.loading')?.textContent ?? null,
}));
console.log('offline reload:', JSON.stringify(offline));
await page.evaluate(() => (location.hash = '/stage/n5'));
await new Promise((r) => setTimeout(r, 800));
console.log('offline N5 stage units listed:', await page.evaluate(() => document.querySelectorAll('.unit').length));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
