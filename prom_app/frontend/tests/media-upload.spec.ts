import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const png = readFileSync('tests/fixtures/inspection/pit-ok.png');
const names = ['первое.png', 'второе.jpeg', 'третье.png'];
const id = (n: number) => `021472d8-a659-47de-893d-bedc24d015e${n}`;

test('multiple photos retain completed uploads and retry only failed confirmation', async ({ page }) => {
  const calls: string[] = [];
  let initializations = 0;
  let secondAttempts = 0;
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/videos/init-upload', async (r) => {
    const n = ++initializations;
    const body = r.request().postDataJSON();
    expect(body.file_name).toBe(names[n - 1]);
    calls.push('init-' + n);
    await r.fulfill({
      json: {
        uuid: id(n),
        upload_url: 'http://127.0.0.1:5173/photos/bucket',
        storage_key: `bucket/${n}/${body.file_name}`,
      },
    });
  });
  await page.route('**/photos/bucket/**', async (r) => {
    if (r.request().method() === 'PUT') {
      const n = Number(new URL(r.request().url()).pathname.split('/')[3]);
      calls.push('put-' + n);
      expect(r.request().headers()['content-type']).toBe(n === 2 ? 'image/jpeg' : 'image/png');
      await r.fulfill({ status: 200 });
    } else await r.fulfill({ body: png, contentType: 'image/png' });
  });
  await page.route('**/upload-complete', async (r) => {
    const n = Number(r.request().url().split('/').at(-2)!.at(-1));
    calls.push('complete-' + n);
    await r.fulfill({ status: n === 2 && secondAttempts++ === 0 ? 502 : 200 });
  });
  await page.goto('/objects');
  await page.getByRole('button', { name: '+ Загрузить фото или видео' }).click();
  await page
    .getByLabel('Фото или видео', { exact: true })
    .setInputFiles(names.map((name) => ({ name, mimeType: '', buffer: png })));
  await page.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('второе.jpeg');
  await expect(dialog).toContainText('Загружено: 1 из 3');
  expect(calls).toEqual(['init-1', 'put-1', 'complete-1', 'init-2', 'put-2', 'complete-2']);
  await page.getByRole('button', { name: 'Повторить подтверждение' }).click();
  await expect(dialog).toContainText('Загружено: 3 из 3');
  expect(calls).toEqual([
    'init-1',
    'put-1',
    'complete-1',
    'init-2',
    'put-2',
    'complete-2',
    'complete-2',
    'init-3',
    'put-3',
    'complete-3',
  ]);
  await page.getByRole('button', { name: 'Перейти к файлам' }).click();
  await expect(page.getByLabel('Файл', { exact: true }).locator('option')).toHaveCount(3);
  await expect(page.getByRole('img', { name: 'третье.png', exact: true })).toBeVisible();
  await page.getByLabel('Файл', { exact: true }).selectOption(id(1));
  await expect(page.getByRole('img', { name: 'первое.png', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/media-upload-photos.png', fullPage: true });
});

test('invalid mixed batch and drag-drop are handled without silently losing files', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let writes = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' || r.method() === 'PUT') writes++;
  });
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.goto('/objects');
  await page.getByRole('button', { name: '+ Загрузить фото или видео' }).click();
  await page.getByLabel('Фото или видео', { exact: true }).setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: png },
    { name: 'b.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') },
  ]);
  await expect(page.getByRole('alert')).toContainText('одно видео или несколько фото');
  await expect(page.getByRole('button', { name: 'Загрузить файлы', exact: true })).toBeDisabled();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['photo'], 'a.png', { type: 'image/png' }));
    data.items.add(new File(['photo'], 'b.jpeg', { type: 'image/jpeg' }));
    return data;
  });
  await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('list', { name: 'Очередь загрузки' }).locator('li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Загрузить файлы', exact: true })).toBeEnabled();
  expect(writes).toBe(0);
  for (const width of [375, 812, 1440]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 812 });
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Загрузить файлы', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Загрузить файлы', exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('dialog').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: 'artifacts/media-upload-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [name, mimeType] of [
  ['камера.avi', 'video/x-msvideo'],
  ['камера.mkv', 'application/octet-stream'],
]) {
  test(`uploads ${name} and retains success when preview fails`, async ({ page }) => {
    let puts = 0;
    await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
    await page.route('**/api/videos/init-upload', (r) =>
      r.fulfill({
        json: {
          uuid: id(1),
          upload_url: 'http://127.0.0.1:5173/unplayable/bucket',
          storage_key: 'bucket/' + name,
        },
      }),
    );
    await page.route('**/unplayable/**', (r) => {
      if (r.request().method() === 'PUT') {
        puts++;
        return r.fulfill({ status: 200 });
      }
      return r.fulfill({ status: 415 });
    });
    await page.route('**/upload-complete', (r) => r.fulfill({ status: 200 }));
    await page.goto('/objects');
    await page.getByRole('button', { name: '+ Загрузить фото или видео' }).click();
    await page
      .getByLabel('Фото или видео', { exact: true })
      .setInputFiles({ name, mimeType, buffer: Buffer.from('video') });
    await page.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
    await page.getByRole('button', { name: 'Перейти к файлам' }).click();
    await expect(page.getByRole('alert')).toContainText('Подтверждённая загрузка сохранена');
    await expect(page.getByRole('link', { name: 'Открыть оригинал' })).toBeVisible();
    expect(puts).toBe(1);
  });
}

test('cancelling a photo batch stops remaining files and retry preserves the first upload', async ({
  page,
}) => {
  let inits = 0;
  const puts: number[] = [];
  const confirms: number[] = [];
  let delaySecond = true;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/videos/init-upload', (r) => {
    const n = ++inits;
    return r.fulfill({
      json: {
        uuid: id(n),
        upload_url: 'http://127.0.0.1:5173/cancel-photos/bucket',
        storage_key: `bucket/${n}/a.png`,
      },
    });
  });
  await page.route('**/cancel-photos/**', async (r) => {
    if (r.request().method() !== 'PUT') return r.fulfill({ body: png, contentType: 'image/png' });
    const n = Number(new URL(r.request().url()).pathname.split('/')[3]);
    puts.push(n);
    if (n === 2 && delaySecond) await pending;
    await r.fulfill({ status: 200 }).catch(() => {});
  });
  await page.route('**/upload-complete', (r) => {
    confirms.push(Number(r.request().url().split('/').at(-2)!.at(-1)));
    return r.fulfill({ status: 200 });
  });
  await page.goto('/objects');
  await page.getByRole('button', { name: '+ Загрузить фото или видео' }).click();
  await page
    .getByLabel('Фото или видео', { exact: true })
    .setInputFiles(['a.png', 'b.png', 'c.png'].map((name) => ({ name, mimeType: 'image/png', buffer: png })));
  await page.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
  await expect.poll(() => puts).toEqual([1, 2]);
  await page.getByRole('button', { name: 'Отменить передачу' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('b.png: Отмена');
  expect(confirms).toEqual([1]);
  expect(inits).toBe(2);
  delaySecond = false;
  release();
  await page.getByRole('button', { name: 'Повторить передачу' }).click();
  await expect(page.getByRole('dialog')).toContainText('Загружено: 3 из 3');
  expect(puts).toEqual([1, 2, 2, 3]);
  expect(confirms).toEqual([1, 2, 3]);
  expect(inits).toBe(3);
});
