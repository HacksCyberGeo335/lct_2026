import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
const demo = existsSync('src/demo/entry.ts');

test('main cannot enable demo through URL and exposes no synthetic assets or actions', async ({
  page,
  request,
}) => {
  test.skip(demo, 'This guard checks the main edition without the optional demo extension.');
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  const errors: string[] = [],
    writes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (['POST', 'PUT'].includes(r.method())) writes.push(r.url());
  });
  for (const path of [
    '/objects',
    '/objects/local',
    '/objects/local/analytics',
    '/objects/local/schedule',
    '/objects/local/settings',
    '/objects/local/inspection?rules=legacy',
  ]) {
    await page.goto(path + (path.includes('?') ? '&' : '?') + 'mode=demo');
    await expect(page.locator('.mode-label')).toHaveText('Рабочее подключение API');
    await expect(page.locator('h1')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /Открыть демо|Загрузить пример|Открыть пример со справочником|По ресурсному плану/,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.reg-row,.report-mark,.inspection-thumb')).toHaveCount(0);
  }
  for (const path of [
    '/inspection/manifest.json',
    '/inspection/pit-missing.png',
    '/media/north-park-1.webm',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('id="root"');
  }
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});

test('API health can be refreshed and a stale success never hides a later error', async ({ page }) => {
  let available = true;
  await page.route('**/health', (r) =>
    available ? r.fulfill({ json: { status: 'ok' } }) : r.fulfill({ status: 503 }),
  );
  await page.goto('/objects?mode=api');
  await expect(page.getByRole('status')).toContainText('Gateway доступен');
  available = false;
  await page.getByRole('button', { name: 'Проверить подключение', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await expect(page.getByText('Gateway доступен', { exact: false })).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Проверить подключение', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Gateway доступен');
});

test('own image and explicitly imported analysis stay local in working mode', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT'].includes(r.method())) writes.push(r.url());
  });
  await page.goto('/objects/local/inspection?mode=api');
  await expect(page.getByText('Добавьте снимки площадки', { exact: true })).toBeVisible();
  await page.getByLabel('Снимки площадки').setInputFiles('tests/fixtures/inspection/pit-missing.png');
  await expect(page.getByTestId('image-detection')).toHaveCount(0);
  const input = page.getByLabel('Импортировать результат анализа (JSON)');
  await input.focus();
  await input.setInputFiles('tests/fixtures/inspection/pit-missing.png.json');
  await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(page.getByTestId('image-detection')).toHaveCount(1);
  await expect(page.getByText('Импортированный JSON', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('confirmed upload survives playback failure and retries viewing without uploading again', async ({
  page,
}) => {
  let puts = 0,
    completes = 0;
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/videos/init-upload', (r) =>
    r.fulfill({
      json: {
        uuid: '021472d8-a659-47de-893d-bedc24d015e7',
        upload_url: 'http://127.0.0.1:5173/test-storage/bucket',
        storage_key: 'bucket/021472d8-a659-47de-893d-bedc24d015e7/a.mp4',
      },
    }),
  );
  await page.route('**/test-storage/**', (r) => {
    if (r.request().method() === 'PUT') {
      puts++;
      return r.fulfill({ status: 200 });
    }
    return r.fulfill({ status: 403 });
  });
  await page.route('**/upload-complete', (r) => {
    completes++;
    return r.fulfill({ status: 200 });
  });
  await page.goto('/objects?mode=api');
  await page.getByRole('button', { name: '+ Загрузить запись' }).click();
  await page
    .getByLabel('Файл записи')
    .setInputFiles({ name: 'a.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await page.getByRole('button', { name: 'Загрузить видео', exact: true }).click();
  await page.getByRole('button', { name: 'Перейти к записи', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Подтверждённая загрузка сохранена');
  await page.getByRole('button', { name: 'Повторить просмотр', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось воспроизвести');
  expect(puts).toBe(1);
  expect(completes).toBe(1);
  await expect(page.getByText('UUID: 021472d8-a659-47de-893d-bedc24d015e7')).toBeVisible();
});
