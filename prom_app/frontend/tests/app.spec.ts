import { test, expect } from '@playwright/test';
test('real synthetic video playback, seeking and local video upload', async ({ page }) => {
  await page.goto(base);
  const video = page.locator('.media-host video');
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).duration)).toBe(60);
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(15.2);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByLabel('Положение в записи').fill('0');
  await expect(page.getByTestId('frame-count')).toHaveText('1');
  await page.getByLabel('Положение в записи').fill('40');
  await expect(page.getByTestId('frame-count')).toHaveText('2');
  const image = await page.locator('.media-host').boundingBox(),
    overlay = await page.getByTestId('detection-overlay').boundingBox();
  expect(image && overlay).toBeTruthy();
  expect(overlay!.width / overlay!.height).toBeCloseTo(16 / 9, 2);
  expect(overlay!.x).toBeGreaterThanOrEqual(image!.x);
  await page.getByRole('button', { name: '+ Загрузить запись' }).click();
  await page.getByLabel('Файл записи').setInputFiles('public/media/north-park-1.webm');
  await page.getByRole('button', { name: 'Открыть локально' }).click();
  await expect(page.getByRole('dialog')).toContainText('Распознавание этого файла не выполнялось');
  await page.getByRole('button', { name: 'Перейти к записи' }).click();
  await expect(page.locator('.media-host video')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByTestId('detection')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Запись недоступна' })).toBeVisible();
});
test('demo has no runtime or failed network errors across all screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(r.url());
  });
  for (const path of ['/objects', base, base + '/analytics', base + '/schedule', base + '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  }
  expect(errors).toEqual([]);
});
const base = '/objects/north-park';
test('five routes, deep links, object switching and history', async ({ page }) => {
  await page.goto('/objects');
  await expect(page.getByRole('heading', { name: 'Ведомость объектов' })).toBeVisible();
  await page.getByRole('link', { name: '01 ЖК «Северный парк», корпус 3', exact: true }).click();
  for (const [name, suffix] of [
    ['Соответствие графику', 'analytics'],
    ['График работ', 'schedule'],
    ['Настройки', 'settings'],
  ]) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/' + suffix + '$'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(page.locator('.factline')).toContainText('Филёвский');
  await page.goBack();
  await expect(page.getByLabel('Выбранный объект')).toHaveValue('north-park');
  await page.goForward();
  await expect(page.getByLabel('Выбранный объект')).toHaveValue('river-quarter');
  await page.getByRole('navigation').getByRole('link', { name: 'Объекты', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Соответствие графику', exact: true }).click();
  await expect(page).toHaveURL(/\/objects\/river-quarter\/analytics$/);
  await expect(page.getByLabel('Выбранный объект')).toHaveValue('river-quarter');
  await page.goto('/objects/missing');
  await expect(page.getByRole('heading', { name: 'Объект не найден' })).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
});
test('mode follows history and survives navigation through the brand link', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/objects?mode=demo');
  await page.getByRole('button', { name: 'Подключение API →' }).click();
  await expect(page.getByRole('heading', { name: 'Подключение и загрузка' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.mode-label')).toHaveText('Демонстрационные данные');
  await expect(page.locator('.reg-row')).toHaveCount(6);
  await page.goForward();
  await expect(page.locator('.mode-label')).toHaveText('Рабочее подключение API');
  await expect(page.locator('.reg-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть демо →' }).click();
  await page.getByRole('link', { name: '01 ЖК «Северный парк», корпус 3', exact: true }).click();
  await page.getByRole('link', { name: 'Стройконтроль — ведомость', exact: true }).click();
  await expect(page).toHaveURL(/\/objects\?mode=demo$/);
  await page.reload();
  await expect(page.locator('.reg-row')).toHaveCount(6);
});
test('combined filters, stable numbering, empty result and reset', async ({ page }) => {
  await page.goto('/objects');
  await page.getByLabel('Поиск по ведомости объектов').fill('ЗАО');
  await page.getByRole('button', { name: 'Риск срыва (2)' }).click();
  await page.getByLabel('Порядок').selectOption('progress');
  await expect(page.locator('.reg-row')).toHaveCount(2);
  await expect(page.locator('.reg-row').first()).toContainText('02');
  await page.getByLabel('Поиск по ведомости объектов').fill('несуществующий объект');
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.locator('.reg-row')).toHaveCount(6);
  await page.getByLabel('Поиск по ведомости объектов').fill('Марьино');
  await page.locator('.reg-row').click();
  await page.getByRole('link', { name: '← Ведомость объектов' }).click();
  await expect(page.getByLabel('Поиск по ведомости объектов')).toHaveValue('Марьино');
});
test('snapshot seek aligns detections and events, camera and processing states', async ({ page }) => {
  await page.goto(base + '?recording=sample-stills');
  const slider = page.getByLabel('Время снимка');
  await expect(page.getByTestId('frame-count')).toHaveText('3');
  await slider.fill('0');
  await expect(page.getByTestId('frame-count')).toHaveText('1');
  await expect(page.getByTestId('event-list').getByRole('button')).toHaveCount(1);
  await slider.fill('40');
  await expect(page.getByTestId('frame-count')).toHaveText('2');
  await page.getByLabel('Камера', { exact: true }).selectOption('3');
  await expect(page.locator('.media-label')).toContainText('Бетонный узел');
  await page.getByLabel('Сценарий демонстрации').selectOption('waiting');
  await expect(page.getByText('Запись ожидает обработки.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('detection')).toHaveCount(0);
  await page.getByLabel('Сценарий демонстрации').selectOption('failed');
  await page.getByRole('button', { name: 'Повторить демоанализ' }).click();
  await expect(page.getByTestId('detection')).not.toHaveCount(0);
  await page.getByLabel('Выбранный объект').selectOption('ice-center');
  await expect(page.getByLabel('Траектории', { exact: true })).toBeDisabled();
  await page.getByLabel('Выбранный объект').selectOption('tennis-center');
  await expect(page.getByRole('heading', { name: 'Камеры ещё не подключены' })).toBeVisible();
});
test('CSV preview, cancellation, invalid input, application and persistence', async ({ page }) => {
  await page.goto(base + '/schedule');
  const stages = page.locator('.gantt-row');
  await expect(stages).toHaveCount(4);
  const original = await stages.count();
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  const csv = 'name,start,end,equipment,quantity\nТестовый фундамент,2026-09-01,2026-10-01,mixer,2';
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Предпросмотр: 1 строк (первые 20)')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(stages).toHaveCount(original);
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.getByLabel('Файл плана').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv.replace('2026-09-01', '2026-02-30')),
  });
  await expect(page.getByRole('alert')).toContainText('Строка 2');
  await expect(page.getByRole('button', { name: 'Применить план' })).toBeDisabled();
  await page
    .getByLabel('Файл плана')
    .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Применить план' }).click();
  await expect(page.getByText('План применён локально к этому демообъекту.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(stages).toHaveCount(1);
  await expect(stages).toContainText('Тестовый фундамент');
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(stages).toHaveCount(4);
});
test('settings persist and failed save retains previous state', async ({ page }) => {
  await page.goto(base + '/settings');
  const toggle = page.getByRole('switch', { name: 'Сводка о ходе строительства' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await toggle.click();
  await expect(page.getByRole('alert')).toContainText('Предыдущее значение сохранено');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});
test('dialog focus trap, repeated open close and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  const trigger = page.getByRole('button', { name: '+ Загрузить запись', exact: true });
  for (let i = 0; i < 3; i++) {
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('[role=dialog]')?.contains(document.activeElement)),
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await expect
    .poll(() => page.locator('.app-main>div').evaluate((e) => getComputedStyle(e).transform))
    .toBe('none');
});
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
  await page.goto('/objects');
  await page.getByRole('button', { name: 'Подключение API →' }).click();
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
  await page.goto('/objects');
  await page.getByRole('button', { name: 'Подключение API →' }).click();
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
  await page.goto('/objects');
  await page.getByRole('button', { name: 'Подключение API →' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.reg-row')).toHaveCount(0);
  await expect(page.locator('.mode-label')).toHaveText('Рабочее подключение API');
});
test('report reflects selected object and period in printable output', async ({ page }) => {
  await page.goto('/objects/river-quarter/analytics?period=30');
  await expect(page.locator('.report-period')).toContainText('27.07.2026 — 25.08.2026');
  await expect(page.locator('.report-period')).toContainText('Речной квартал');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.chrome')).toBeHidden();
  await expect(page.locator('.report-mark')).toBeVisible();
  await page.pdf({
    path: 'artifacts/report-river-30.pdf',
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
});
for (const width of [1440, 1280, 768, 390]) {
  test('responsive layout ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const suffix of ['', '/analytics', '/schedule', '/settings']) {
      await page.goto(base + suffix);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: 'artifacts/' + (suffix.slice(1) || 'site') + '-' + width + '.png',
        fullPage: true,
      });
    }
    await page.goto('/objects');
    await page.screenshot({ path: 'artifacts/objects-' + width + '.png', fullPage: true });
  });
}
