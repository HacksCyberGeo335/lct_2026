import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

let previewServer, invalidServer, browser;
const originalMode = process.env.VITE_APP_MODE;
const results = [];
try {
  previewServer = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of [
    '/objects',
    '/objects/north-park',
    '/objects/north-park/analytics',
    '/objects/north-park/schedule',
    '/objects/north-park/settings',
  ]) {
    const response = await page.goto('http://127.0.0.1:4173' + path + '?mode=demo');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    results.push({ previewPath: path, status: response.status() });
  }
  await page.getByRole('link', { name: 'Стройконтроль — ведомость', exact: true }).click();
  await expect(page.locator('.reg-row')).toHaveCount(6);
  await page.reload();
  await expect(page.locator('.mode-label')).toHaveText('Демонстрационные данные');
  await page.goto('http://127.0.0.1:4173/objects/north-park?mode=demo');
  await expect
    .poll(() => page.locator('video').evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  expect(await page.locator('video').evaluate((video) => video.duration)).toBe(60);
  await page.goto('http://127.0.0.1:4173/objects');
  await expect(page.getByRole('heading', { name: 'Подключение и загрузка' })).toBeVisible();
  results.push({ productionDefault: 'api', explicitDemo: true, videoDuration: 60 });

  process.env.VITE_APP_MODE = 'unsupported-value';
  invalidServer = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
  await invalidServer.listen();
  await page.goto('http://127.0.0.1:5174/objects');
  await expect(page.getByRole('heading', { name: 'Ошибка конфигурации' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('VITE_APP_MODE должен быть demo или api');
  await expect(page.locator('.reg-row')).toHaveCount(0);
  results.push({ invalidEnvironment: 'configuration error', silentDemoFallback: false });
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
