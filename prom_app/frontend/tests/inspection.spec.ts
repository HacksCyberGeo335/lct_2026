import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import result from '../public/inspection/pit-missing.png.json' with { type: 'json' };
const route = '/objects/north-park/inspection?mode=demo';
const csv =
  'id,parent_id,name,start,end,zone,resources\nroot,,Стройка,2026-08-01,2026-09-30,,\npit,root,Разработка котлована,2026-08-01,2026-08-31,А,exc:1|dump:2';

test('TZ example explains missing and unexpected equipment, correct observations and other zones', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(route);
  await page.getByRole('button', { name: 'Загрузить пример ТЗ', exact: true }).click();
  const assessment = page.getByTestId('assessment');
  await expect(assessment).toHaveCount(1);
  await expect(assessment).toContainText('Не хватает необходимой техники: Самосвалы');
  await expect(assessment).toContainText('обнаружено 0');
  await page.getByRole('button', { name: 'pit-unexpected.png Демо', exact: true }).click();
  await expect(assessment).toContainText('Техника не соответствует активным этапам зоны: Краны');
  await page.getByRole('button', { name: 'pit-ok.png Демо', exact: true }).click();
  await expect(assessment).toContainText('Отклонений не обнаружено');
  await page.getByRole('button', { name: 'foundation-ok.png Демо', exact: true }).click();
  await expect(assessment).toContainText('Устройство фундамента');
  await expect(assessment).toContainText('Отклонений не обнаружено');
  await page.getByLabel('Показать неактивные этапы и другие зоны').check();
  await expect(assessment).toHaveCount(3);
  await expect(assessment.filter({ hasText: 'Монтаж каркаса' })).toContainText('Этап не активен');
  expect(errors).toEqual([]);
});

test('a real PNG and matching imported result are bound and compared without backend requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (/^\/(api\/|health$)/.test(new URL(r.url()).pathname) || ['POST', 'PUT'].includes(r.method()))
      requests.push(r.url());
  });
  await page.goto(route);
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Применить план' }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
  await expect(
    page.getByRole('img', { name: 'Снимок площадки: pit-missing.png', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('image-detection')).toHaveCount(0);
  const upload = page.getByLabel('Импортировать результат анализа (JSON)');
  await upload.setInputFiles('public/inspection/pit-ok.png.json');
  await expect(page.getByRole('alert')).toContainText('другому снимку');
  await upload.setInputFiles('public/inspection/pit-missing.png.json');
  await expect(page.getByRole('dialog')).toContainText('SHA-256');
  await expect(page.getByTestId('image-detection')).toHaveCount(0);
  await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
  await expect(page.getByTestId('image-detection')).toHaveCount(1);
  await expect(page.getByTestId('assessment')).toContainText('Не хватает необходимой техники');
  expect(requests).toEqual([]);
});

test('unknown classes stay readable and inconclusive, corrupt image batches do not partially apply', async ({
  page,
}) => {
  await page.goto(route);
  await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
  await page.getByLabel('Импортировать результат анализа (JSON)').setInputFiles({
    name: 'result.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...result, detections: [{ ...result.detections[0], class_id: 'unknown-truck' }] }),
    ),
  });
  await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
  await expect(page.locator('.inspection-viewer table')).toContainText('Неизвестный класс: unknown-truck');
  await page.getByLabel('Снимки площадки').setInputFiles([
    { name: 'pit-ok.png', mimeType: 'image/png', buffer: readFileSync('public/inspection/pit-ok.png') },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
  ]);
  await expect(page.getByRole('alert')).toContainText('повреждено');
  await expect(page.locator('.inspection-thumb')).toHaveCount(1);
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(page.locator('.inspection-thumb')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('image')).toBe(false);
});

test('API mode supports local image inspection and local plans without pretending server processing', async ({
  page,
}) => {
  // An arbitrary future API object ID must not collide with Object.prototype keys.
  await page.goto('/objects/constructor/inspection?mode=api');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Применить план' }).click();
  await expect(page.getByRole('dialog')).toContainText('На сервер не отправлен');
  await page.keyboard.press('Escape');
  await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
  await expect(page.getByText('Анализ не получен', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Добавьте снимки площадки', exact: true })).toBeVisible();
});

test('calendar preserves child stages and never substitutes a demo frame as their evidence', async ({
  page,
}) => {
  await page.goto('/objects/north-park/schedule?mode=demo');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Применить план' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.gantt-row')).toHaveCount(2);
  await expect(page.locator('.gantt-name').first()).toContainText('▾');
  await page.getByRole('button', { name: 'Подробности: Разработка котлована', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Экскаваторы: 1');
  await expect(page.getByRole('dialog')).toContainText('Самосвалы: 2');
  await expect(page.getByRole('dialog')).toContainText('Подходящих снимков');
  await expect(page.getByRole('link', { name: /00:15/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Проверить снимки для этапа →' }).click();
  await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
  await page
    .getByLabel('Импортировать результат анализа (JSON)')
    .setInputFiles('public/inspection/pit-missing.png.json');
  await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'График работ', exact: true }).click();
  await page.getByRole('button', { name: 'Подробности: Разработка котлована', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть снимок-основание: pit-missing.png →', exact: true }).click();
  await expect(page.getByTestId('assessment')).toContainText('Не хватает необходимой техники');
  await expect(page.locator('.inspection-image img')).toHaveAttribute('src', /^blob:/);
  await page.locator('.inspection-method summary').click();
  await expect(page.locator('.inspection-method caption')).toHaveText('Календарный план объекта');
});

test('PNG, JPEG and WebP portrait images keep normalized boxes aligned to native geometry', async ({
  page,
}) => {
  await page.goto(route);
  for (const [extension, mimeType] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ]) {
    const name = 'portrait.' + extension;
    const data = await page.evaluate((mime) => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 600;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#0e5a53';
      context.fillRect(0, 0, 300, 600);
      return canvas.toDataURL(mime).split(',')[1];
    }, mimeType);
    const buffer = Buffer.from(data, 'base64');
    await page.getByLabel('Снимки площадки').setInputFiles({ name, mimeType, buffer });
    await expect(page.locator('.inspection-viewer h2')).toHaveText(name);
    const imported = {
      ...result,
      image: { name, width: 300, height: 600, sha256: createHash('sha256').update(buffer).digest('hex') },
      detections: [{ ...result.detections[0], bbox: [0.5, 0.5, 0.5, 0.5] }],
    };
    await page.getByLabel('Импортировать результат анализа (JSON)').setInputFiles({
      name: 'result.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
    await expect(page.getByTestId('image-detection')).toHaveCount(1);
    const image = await page.locator('.inspection-image img').boundingBox();
    const box = await page.getByTestId('image-detection').locator('rect').boundingBox();
    expect(image!.height / image!.width).toBeCloseTo(2, 1);
    expect((box!.x - image!.x) / image!.width).toBeCloseTo(0.5, 2);
    expect((box!.y - image!.y) / image!.height).toBeCloseTo(0.5, 2);
    expect(box!.width / image!.width).toBeCloseTo(0.5, 2);
    expect(box!.height / image!.height).toBeCloseTo(0.5, 2);
  }
});

for (const [width, height] of [
  [375, 960],
  [768, 960],
  [1280, 960],
  [1440, 960],
  [844, 390],
])
  test('inspection responsive layout ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await page.getByRole('button', { name: 'Загрузить пример ТЗ', exact: true }).click();
    await expect(page.getByTestId('assessment')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const table of await page
      .locator('.inspection-viewer .table-scroll, .assessment-card .table-scroll')
      .all())
      expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: 'artifacts/inspection-' + width + '.png', fullPage: true });
  });
