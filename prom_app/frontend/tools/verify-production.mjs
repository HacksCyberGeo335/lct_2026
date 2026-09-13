import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const base = process.env.PRODUCTION_URL || 'http://127.0.0.1:4180';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
for (const path of [
  '/objects',
  '/objects/north-park',
  '/objects/north-park/analytics',
  '/objects/north-park/schedule',
  '/objects/north-park/settings',
]) {
  const response = await page.goto(base + path + '?mode=demo');
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (response.status() !== 200) throw new Error('Bad deep link ' + path);
  results.push({ path, status: response.status(), title: await page.title() });
}
for (const path of ['/api', '/api/videos/unsupported', '/media/missing.webm', '/assets/missing.js']) {
  const response = await fetch(base + path),
    body = await response.text();
  if (response.status < 400 || body.includes('id="root"'))
    throw new Error('SPA fallback leaked into ' + path);
  results.push({ path, status: response.status, isSpa: false });
}
await page.goto(base + '/objects');
await page.getByRole('heading', { name: 'Подключение и загрузка' }).waitFor();
results.push({ defaultMode: await page.locator('.mode-label').innerText() });
await page.goto(base + '/objects/north-park?mode=demo');
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
results.push({ videoDuration: await page.locator('video').evaluate((v) => v.duration) });
await page.reload();
await page.getByRole('heading', { level: 1 }).waitFor();
await page.screenshot({ path: 'artifacts/production-site.png', fullPage: true });
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
writeFileSync('artifacts/production-checks.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
