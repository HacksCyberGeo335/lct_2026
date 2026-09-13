import { expect, test } from '@playwright/test';

test('MP4 demo upload plays without backend and changing objects clears the previous source', async ({
  page,
}) => {
  const backendRequests: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (
      /^\/(api\/|health$)/.test(new URL(request.url()).pathname) ||
      ['POST', 'PUT'].includes(request.method())
    )
      backendRequests.push(request.method() + ' ' + request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/objects/north-park?mode=demo&camera=3');
  await page.getByRole('button', { name: '+ Загрузить запись', exact: true }).click();
  await page.getByLabel('Файл записи').setInputFiles('tests/fixtures/sample-h264.mp4');
  await page.getByRole('button', { name: 'Открыть локально', exact: true }).click();
  await page.getByRole('button', { name: 'Перейти к записи', exact: true }).click();
  const video = page.locator('.media-host video');
  await expect(video).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration)).toBe(3);
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.getByTestId('detection')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Объекты', exact: true }).click();
  await page.getByRole('link', { name: '02 ЖК «Речной квартал», корпус 1', exact: true }).click();
  await expect(page.getByLabel('Камера', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Источник', { exact: true })).toHaveValue('sample');
  await expect(video).toHaveAttribute('src', '/media/river-quarter-1.webm');
  expect(new URL(page.url()).searchParams.has('recording')).toBe(false);
  await page.goBack();
  await page.goBack();
  await expect(video).toHaveAttribute('src', /^blob:/);
  expect(backendRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('zero-time deep links, saved seek positions and fresh uploads start at the selected time', async ({
  page,
}) => {
  await page.goto('/objects/north-park?mode=demo&t=0');
  const video = page.locator('.media-host video');
  await expect(page.getByTestId('frame-count')).toHaveText('1');
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(0);
  await page.getByLabel('Положение в записи').fill('20.3');
  await expect.poll(() => new URL(page.url()).searchParams.get('t')).toBe('20.3');
  await page.reload();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeCloseTo(20.3, 1);
  await page.getByRole('button', { name: '+ Загрузить запись', exact: true }).click();
  await page.getByLabel('Файл записи').setInputFiles('public/media/north-park-1.webm');
  await page.getByRole('button', { name: 'Открыть локально', exact: true }).click();
  await page.getByRole('button', { name: 'Перейти к записи', exact: true }).click();
  await expect(video).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(0);
});

test('missing media hides observations until retry loads a real frame', async ({ page }) => {
  await page.route('**/media/north-park-1.webm', (route) => route.abort());
  await page.goto('/objects/north-park?mode=demo');
  await expect(page.getByRole('alert')).toContainText('Запись недоступна');
  await expect(page.getByTestId('frame-count')).toHaveText('—');
  await expect(page.getByTestId('detection')).toHaveCount(0);
  await expect(page.getByLabel('Положение в записи')).toBeDisabled();
  await page.unroute('**/media/north-park-1.webm');
  await page.getByRole('button', { name: 'Повторить воспроизведение' }).click();
  await expect(page.getByTestId('frame-count')).toHaveText('3');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('uploaded videos longer than a minute keep their actual duration and seek position', async ({
  page,
}) => {
  await page.goto('/objects/north-park?mode=demo');
  await page.getByRole('button', { name: '+ Загрузить запись', exact: true }).click();
  await page.getByLabel('Файл записи').setInputFiles('tests/fixtures/two-minute.webm');
  await page.getByRole('button', { name: 'Открыть локально', exact: true }).click();
  await page.getByRole('button', { name: 'Перейти к записи', exact: true }).click();
  const video = page.locator('.media-host video');
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration)).toBe(120);
  await expect(page.getByLabel('Положение в записи')).toHaveAttribute('max', '120');
  await page.getByLabel('Положение в записи').fill('95');
  await expect.poll(() => new URL(page.url()).searchParams.get('t')).toBe('95');
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(95);
  await expect(page.locator('.deck')).toContainText('01:35 / 02:00');
});

test('corrupt plan recovery preserves other objects and settings', async ({ page }) => {
  await page.goto('/objects?mode=demo');
  await page.evaluate(() => {
    localStorage.setItem('stroykontrol:demo:v1:plan:north-park', '{broken');
    localStorage.setItem(
      'stroykontrol:demo:v1:settings:north-park',
      JSON.stringify({ weekly: true, deviations: true, cameras: true }),
    );
    localStorage.setItem(
      'stroykontrol:demo:v1:plan:river-quarter',
      JSON.stringify([
        {
          id: 'other',
          name: 'Другой сохранённый план',
          start: '2026-09-01',
          end: '2026-10-01',
          zone: '',
          equipment: null,
          quantity: null,
          actualStart: null,
          actualEnd: null,
          plan: null,
          fact: null,
        },
      ]),
    );
  });
  await page.reload();
  await expect(page.locator('.reg-row')).toHaveCount(6);
  await page.getByRole('link', { name: '01 ЖК «Северный парк», корпус 3', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'План объекта недоступен' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Сводка о ходе строительства' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('navigation').getByRole('link', { name: 'График работ', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить исходный план', exact: true }).click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'План объекта недоступен' })).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить исходный план', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить план', exact: true }).click();
  await expect(page.locator('.gantt-row')).toHaveCount(4);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#main')).toBeFocused();
  await page.getByLabel('Выбранный объект').selectOption('river-quarter');
  await expect(page.locator('.gantt-row')).toHaveCount(1);
  await expect(page.locator('.gantt-row')).toContainText('Другой сохранённый план');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('stroykontrol:demo:v1:settings:north-park')!).weekly,
    ),
  ).toBe(true);
});

test('import replaces the forecast and shows physical CSV error lines', async ({ page }) => {
  await page.goto('/objects/north-park/schedule?mode=demo');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.getByLabel('Файл плана').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '\nname,start,end\n"Длинное\nназвание",2026-01-01,2026-02-01\n\nОшибка,2026-02-30,2026-03-01',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('Строка 6');
  await expect(page.getByRole('button', { name: 'Применить план' })).toBeDisabled();
  await page.getByLabel('Файл плана').setInputFiles({
    name: 'plan.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,start,end\nНовый план,2026-09-01,2026-10-01'),
  });
  await page.getByRole('button', { name: 'Применить план' }).click();
  await expect(page.getByText('План применён локально к этому демообъекту.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Соответствие графику', exact: true }).click();
  await expect(page.locator('.kpi').filter({ hasText: 'Прогноз завершения' })).toContainText(
    'Недостаточно данных',
  );
  await expect(page.getByRole('heading', { name: 'Нет данных для графика' })).toBeVisible();
});

test('storage reset failure is visible inside the open confirmation dialog', async ({ page }) => {
  await page.goto('/objects/north-park/settings?mode=demo');
  await page.getByRole('switch', { name: 'Сводка о ходе строительства' }).click();
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await page.getByRole('button', { name: 'Сбросить демосостояние', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить демоданные', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Не удалось завершить сброс');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Сводка о ходе строительства' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});
