import { test, expect } from '@playwright/test';
test('API upload sequence and confirmation retry without another PUT', async ({ page }) => {
  const calls: string[] = [];
  let completes = 0;
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/videos/init-upload', async (route) => {
    calls.push('init');
    expect(route.request().postDataJSON()).toEqual({ file_name: 'камера #1.mp4', size: 10 });
    await route.fulfill({
      json: {
        uuid: '021472d8-a659-47de-893d-bedc24d015e7',
        upload_url: 'http://127.0.0.1:5173/mock-storage/bucket',
        storage_key: 'bucket/021472d8-a659-47de-893d-bedc24d015e7/камера #1.mp4',
      },
    });
  });
  await page.route('**/mock-storage/**', async (r) => {
    if (r.request().method() === 'PUT') {
      calls.push('put');
      expect(decodeURIComponent(new URL(r.request().url()).pathname)).toBe(
        '/mock-storage/bucket/021472d8-a659-47de-893d-bedc24d015e7/камера #1.mp4',
      );
    }
    await r.fulfill({ status: 200 });
  });
  await page.route('**/upload-complete', async (r) => {
    calls.push('complete');
    completes++;
    await r.fulfill({ status: completes === 1 ? 502 : 200 });
  });
  await page.goto('/objects?mode=api');
  await expect(page.getByRole('heading', { name: 'Подключение и загрузка' })).toBeVisible();
  await expect(page.locator('.reg-row')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Загрузить запись' }).click();
  await page
    .getByLabel('Файл записи')
    .setInputFiles({ name: 'камера #1.mp4', mimeType: 'video/mp4', buffer: Buffer.from('0123456789') });
  await page.getByRole('button', { name: 'Загрузить видео', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 502');
  await page.getByRole('button', { name: 'Повторить подтверждение' }).click();
  await expect(page.getByRole('dialog')).toContainText('READY: видео загружено; анализ пока недоступен.');
  expect(calls).toEqual(['init', 'put', 'complete', 'complete']);
});
test('failed PUT and cancellation never call complete', async ({ page }) => {
  let confirms = 0;
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/videos/init-upload', (r) =>
    r.fulfill({
      json: {
        uuid: '021472d8-a659-47de-893d-bedc24d015e7',
        upload_url: 'http://127.0.0.1:5173/mock-put/bucket',
        storage_key: 'bucket/021472d8-a659-47de-893d-bedc24d015e7/a.mp4',
      },
    }),
  );
  await page.route('**/mock-put/**', (r) => r.fulfill({ status: 500 }));
  await page.route('**/upload-complete', (r) => {
    confirms++;
    return r.fulfill({ status: 200 });
  });
  await page.goto('/objects?mode=api');
  await page.getByRole('button', { name: '+ Загрузить запись' }).click();
  await page
    .getByLabel('Файл записи')
    .setInputFiles({ name: 'a.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await page.getByRole('button', { name: 'Загрузить видео', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 500');
  expect(confirms).toBe(0);
  await page.unroute('**/mock-put/**');
  await page.route('**/mock-put/**', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await r.fulfill({ status: 200 }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Повторить передачу' }).click();
  await page.getByRole('button', { name: 'Отменить передачу' }).click();
  await expect(page.getByRole('dialog')).toContainText('Передача отменена');
  expect(confirms).toBe(0);
});
test('API failure remains API and never switches to fixtures', async ({ page }) => {
  await page.route('**/health', (r) => r.abort('failed'));
  await page.goto('/objects?mode=api');
  await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.reg-row')).toHaveCount(0);
  await expect(page.locator('.mode-label')).toHaveText('Рабочее подключение API');
});
