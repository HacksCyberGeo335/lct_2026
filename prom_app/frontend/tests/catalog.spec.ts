import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const route = '/objects/north-park/inspection?mode=demo';
async function demo(page: Page) {
  await page.goto(route);
  await page.getByRole('button', { name: 'Открыть пример со справочником', exact: true }).click();
  await expect(page.locator('.catalog-group')).toHaveCount(2);
}
test('catalog is lazy, filtered by stable IDs, and distinguishes aggregates and missing duration', async ({
  page,
}) => {
  const catalogRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/catalog/')) catalogRequests.push(r.url());
  });
  await page.goto('/objects?mode=demo');
  await expect(page.locator('.reg-row')).toHaveCount(6);
  expect(catalogRequests).toHaveLength(0);
  await page.goto(route);
  await expect(page.getByRole('group', { name: 'Работы справочника' }).getByRole('button')).toHaveCount(377);
  await page.getByLabel('Поиск работы').fill('work_047');
  await page.getByRole('group', { name: 'Работы справочника' }).getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Устройство котлована', exact: true })).toBeVisible();
  await page.getByText('Длительности и ограничения', { exact: false }).click();
  await expect(page.locator('.catalog-details')).toContainText('Это примеры, а не календарный план');
  const cards = JSON.parse(readFileSync('public/catalog/construction_work_cards.json', 'utf8')).cards;
  const durations = JSON.parse(
    readFileSync('public/catalog/construction_work_duration_review.json', 'utf8'),
  ).works;
  const noNumber = durations.find(
    (w: { benchmarks: unknown[]; row_kind: string }) => !w.benchmarks.length && w.row_kind === 'ITEM',
  );
  await page.locator('.catalog-picker summary').click();
  await page.getByLabel('Поиск работы').fill(noNumber.work_id);
  await page.getByRole('group', { name: 'Работы справочника' }).getByRole('button').click();
  await expect(page.locator('.catalog-details')).toContainText('Числовой ориентир не подтверждён');
  await page.locator('.catalog-picker summary').click();
  await page
    .getByLabel('Поиск работы')
    .fill(cards.find((c: { row_kind: string }) => c.row_kind === 'AGGREGATE').id);
  await page.getByRole('group', { name: 'Работы справочника' }).getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Сопоставление со справочником' })).toContainText(
    'Это сводный раздел',
  );
  await expect(page.locator('.catalog-group')).toHaveCount(0);
});
test('demo explains method and phase changes, exports evidence, and preserves open-world semantics', async ({
  page,
}) => {
  const errors: string[] = [],
    writes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) writes.push(r.url());
  });
  await demo(page);
  await expect(page.locator('.catalog-group').nth(0)).toContainText('Есть связанный класс техники');
  await expect(page.locator('.catalog-group').nth(1)).toContainText('Условие не применяется');
  await page
    .getByRole('combobox', { name: 'Перемещение грунта', exact: true })
    .selectOption('dump_truck_haulage');
  await expect(page.locator('.catalog-group').nth(1)).toContainText('Не обнаружено в наблюдениях');
  await expect(page.locator('.catalog-group').nth(1)).toContainText('Один кадр не доказывает');
  await page.getByLabel('Вывоз грунта', { exact: true }).uncheck();
  await expect(page.locator('.catalog-group').nth(1)).toContainText('Фаза не активна');
  await page.getByRole('combobox', { name: 'Разработка грунта', exact: true }).selectOption('');
  await expect(page.locator('.catalog-group').nth(0)).toContainText('Недостаточно данных');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать объяснение проверки' }).click();
  const download = await downloadEvent;
  const report = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(report.catalogId).toBe('construction-reviewed-2026-09-18');
  expect(report.automaticAbsenceAlertEnabled).toBe(false);
  expect(report.observations[0].result.image.sha256).toHaveLength(64);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
test('profile persists across reload, imports only after preview, and isolates sites', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Сохранить профиль в браузере' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать профиль', exact: true }).click();
  const download = await downloadEvent,
    file = (await download.path())!;
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Перемещение грунта', exact: true })).toHaveValue('other');
  await expect(page.locator('.inspection-thumb')).toHaveCount(0);
  await page.getByLabel('JSON-профиль проверки').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...profile, catalogId: 'old' })),
  });
  await expect(page.getByRole('alert')).toContainText('Версия справочника');
  await page
    .getByRole('combobox', { name: 'Перемещение грунта', exact: true })
    .selectOption('dump_truck_haulage');
  await page
    .getByLabel('JSON-профиль проверки')
    .setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Перемещение грунта', exact: true })).toHaveValue(
    'dump_truck_haulage',
  );
  await page
    .getByLabel('JSON-профиль проверки')
    .setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: readFileSync(file) });
  await page.getByRole('button', { name: 'Применить профиль', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Перемещение грунта', exact: true })).toHaveValue('other');
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(page.getByLabel('Зона работы', { exact: true })).toHaveValue('');
  await page
    .getByLabel('JSON-профиль проверки')
    .setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(page.getByRole('alert')).toContainText('другому объекту');
});
test('new flow accepts a bound real PNG and canonical detector result, rejects foreign image', async ({
  page,
}) => {
  await page.goto(route);
  await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
  await expect(
    page.getByRole('img', { name: 'Снимок площадки: pit-missing.png', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Импортировать результат анализа (JSON)')
    .setInputFiles('public/inspection/pit-ok.png.json');
  await expect(page.getByRole('alert')).toContainText('другому снимку');
  const result = JSON.parse(readFileSync('public/inspection/pit-missing.png.json', 'utf8'));
  result.detections[0].class_id = 'excavator';
  await page.getByLabel('Импортировать результат анализа (JSON)').setInputFiles({
    name: 'result.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(result)),
  });
  await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
  await expect(page.getByTestId('image-detection')).toHaveCount(1);
  await expect(page.locator('.inspection-viewer table')).toContainText('Экскаватор');
});
test('calendar CSV binds work/version and stale versions cannot replace it', async ({ page }) => {
  await page.goto(route);
  await page.getByText('Загрузить календарный план CSV', { exact: true }).click();
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.getByLabel('Файл плана').setInputFiles('public/catalog/plan-example.csv');
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('На сервер не отправлен');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Строка календаря', exact: true }).selectOption('pit');
  await expect(page.getByRole('heading', { name: 'Устройство котлована', exact: true })).toBeVisible();
  await expect(page.getByLabel('Зона работы', { exact: true })).toHaveValue('А');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  const csv = readFileSync('public/catalog/plan-example.csv', 'utf8').replace(
    'construction-reviewed-2026-09-18',
    'old',
  );
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'old.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('другая версия');
});
test('catalog corruption fails closed and retry recovers', async ({ page }) => {
  const path = '**/catalog/construction_work_equipment.json';
  await page.route(path, (r) => r.fulfill({ status: 200, body: '{}', contentType: 'application/json' }));
  await page.goto(route);
  await expect(page.getByRole('alert')).toContainText('Размер файла справочника');
  await expect(page.getByLabel('Поиск работы')).toHaveCount(0);
  await page.unroute(path);
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByLabel('Поиск работы')).toBeVisible();
});
test('calendar evidence links choose the catalog workflow for catalog-bound rows', async ({ page }) => {
  await page.goto('/objects/north-park/schedule?mode=demo');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.getByLabel('Файл плана').setInputFiles('public/catalog/plan-example.csv');
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Подробности: Устройство котлована', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('work_047');
  await expect(page.getByRole('dialog')).toContainText('откройте проверку по справочнику');
  await page.getByRole('link', { name: 'Проверить снимки для этапа →' }).click();
  await expect(page.getByRole('heading', { name: 'Снимки и работы', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Строка календаря', exact: true })).toHaveValue('pit');
  await expect(page.getByRole('heading', { name: 'Устройство котлована', exact: true })).toBeVisible();
  await expect(page.getByLabel('Зона работы', { exact: true })).toHaveValue('А');
  expect(new URL(page.url()).searchParams.get('rules')).not.toBe('legacy');
});
for (const [width, height] of [
  [375, 960],
  [844, 390],
  [1440, 1000],
]) {
  test('catalog responsive keyboard and window controls ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await demo(page);
    const summary = page.getByText('Один снимок или интервал наблюдения', { exact: true });
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('combobox', { name: 'Режим наблюдения', exact: true }).selectOption('window');
    await page.getByLabel('ID камеры', { exact: true }).fill('1');
    await page.getByLabel('Начало интервала · Москва', { exact: true }).fill('2026-08-25T14:00');
    await page.getByLabel('Конец интервала · Москва', { exact: true }).fill('2026-08-25T15:00');
    await expect(page.locator('.catalog-assessment')).toContainText('Задайте минимальное число');
    await page.getByText('Камера и возможности модели', { exact: true }).click();
    await page.getByText('Допустимые альтернативы для выбранной технологии', { exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: 'artifacts/catalog-' + width + '.png', fullPage: true });
  });
}
