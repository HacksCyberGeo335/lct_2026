import { chromium, expect } from '@playwright/test';
import { writeFileSync, existsSync } from 'node:fs';
const demo = existsSync('src/demo/entry.ts');
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
  '/objects/north-park/inspection',
  '/objects/north-park/settings',
]) {
  const response = await page.goto(base + path + '?mode=demo');
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (response.status() !== 200) throw new Error('Bad deep link ' + path);
  results.push({ path, status: response.status(), title: await page.title() });
}
for (const path of [
  '/api',
  '/api/videos/unsupported',
  '/media/missing.webm',
  '/inspection/missing.png',
  '/inspection/missing.json',
  '/catalog/missing.json',
  '/assets/missing.js',
  '/fonts/missing.woff2',
]) {
  const response = await fetch(base + path),
    body = await response.text();
  if (response.status < 400 || body.includes('id="root"'))
    throw new Error('SPA fallback leaked into ' + path);
  results.push({ path, status: response.status, isSpa: false });
}
await page.goto(base + '/objects');
await page.getByRole('heading', { name: 'Подключение и загрузка' }).waitFor();
results.push({ defaultMode: await page.locator('.mode-label').innerText() });
if (demo) {
  await page.goto(base + '/objects/north-park/inspection?mode=demo');
  await page.getByRole('button', { name: 'Открыть пример со справочником', exact: true }).click();
  await expect(page.locator('.catalog-group').nth(1)).toContainText('Условие не применяется');
} else {
  await page.goto(base + '/objects?mode=demo');
  await expect(page.locator('.mode-label')).toHaveText('Рабочее подключение API');
  for (const path of ['/inspection/manifest.json', '/inspection/pit-missing.png', '/media/north-park-1.webm'])
    expect((await fetch(base + path)).status).toBe(404);
}
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
writeFileSync('artifacts/production-checks.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
