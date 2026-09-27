// No request interception or fake services: this writes one video to the configured real stack.
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const file = process.argv[2];
if (!file || !existsSync(file))
  throw new Error('Pass a real video path: node tools/verify-live.mjs path/to/video.mp4');
const health = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(10000) }).catch(
  (error) => {
    throw new Error(
      'Live check blocked: start frontend, Gateway, Upload Service, PostgreSQL and MinIO first.',
      { cause: error },
    );
  },
);
if (!health.ok || (await health.json()).status !== 'ok')
  throw new Error('Live Gateway health check failed: HTTP ' + health.status);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const requests = [];
  page.on('response', (r) => {
    const method = r.request().method();
    if (['POST', 'PUT'].includes(method))
      requests.push({ method, path: new URL(r.url()).pathname, status: r.status() });
  });
  await page.goto(new URL('/objects?mode=api', base).href);
  await page.getByRole('button', { name: '+ Загрузить запись' }).click();
  await page.getByLabel('Файл записи').setInputFiles(resolve(file));
  await page.getByRole('button', { name: 'Загрузить видео', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('READY: видео загружено', { timeout: 120000 });
  const uuid = await page.getByRole('dialog').locator('.mono.small-text').innerText();
  await page.getByRole('button', { name: 'Перейти к записи', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => v.readyState), { timeout: 20000 })
    .toBeGreaterThanOrEqual(1);
  expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
  expect(requests.filter((r) => r.path.endsWith('/upload-complete'))).toHaveLength(1);
  expect(requests.every((r) => r.status >= 200 && r.status < 300)).toBe(true);
  console.log(
    JSON.stringify(
      {
        uuid,
        requests,
        playback: 'metadata loaded',
        cleanup: 'No delete API exists; the uploaded video remains in storage.',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
