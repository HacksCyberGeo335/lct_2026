import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const demo = existsSync('src/demo/entry.ts');
let previewServer, invalidServer, browser;
const originalMode = process.env.VITE_APP_MODE;
const results = [];
try {
  previewServer = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of [
    '/objects',
    '/objects/local',
    '/objects/local/analytics',
    '/objects/local/schedule',
    '/objects/local/inspection',
    '/objects/local/settings',
  ]) {
    const response = await page.goto('http://127.0.0.1:4173' + path + '?mode=api');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.reg-row,.report-mark,.inspection-thumb')).toHaveCount(0);
    results.push({ previewPath: path, status: response.status() });
  }
  await page.goto('http://127.0.0.1:4173/objects');
  await expect(page.locator('.mode-label')).toHaveText('Рабочая версия');
  if (demo) {
    await page.goto('http://127.0.0.1:4173/objects/north-park/inspection?mode=demo');
    await page.getByRole('button', { name: 'Открыть пример со справочником', exact: true }).click();
    await expect(page.locator('.catalog-group').nth(1)).toContainText('Условие не применяется');
    results.push({ demoExtension: 'explicit demo works' });
  } else {
    await page.goto('http://127.0.0.1:4173/objects?mode=demo');
    await expect(page.locator('.mode-label')).toHaveText('Рабочая версия');
    await expect(page.getByRole('button', { name: 'Открыть демо →' })).toHaveCount(0);
    for (const path of [
      '/inspection/manifest.json',
      '/inspection/pit-missing.png',
      '/media/north-park-1.webm',
      '/tests/fixtures/inspection/manifest.json',
    ]) {
      const response = await fetch('http://127.0.0.1:4173' + path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('id="root"');
    }
    results.push({ mainEdition: 'no demo switch, fixtures or public synthetic media' });
  }
  process.env.VITE_APP_MODE = 'unsupported-value';
  invalidServer = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  await invalidServer.listen();
  await page.goto('http://127.0.0.1:5174/objects');
  await expect(page.getByRole('heading', { name: 'Ошибка конфигурации' })).toBeVisible();
  expect(errors).toEqual([]);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/preview-checks.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (originalMode === undefined) delete process.env.VITE_APP_MODE;
  else process.env.VITE_APP_MODE = originalMode;
  await browser?.close();
  await invalidServer?.close();
  if (previewServer) await new Promise((resolve) => previewServer.httpServer.close(resolve));
}
