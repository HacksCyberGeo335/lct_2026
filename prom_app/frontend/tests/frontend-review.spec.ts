import { expect, test } from '@playwright/test';
const route = '/objects/north-park/inspection?mode=demo';

test('changing zone invalidates coverage and stale save confirmation; saving repairs corrupt storage', async ({
  page,
}) => {
  await page.goto(route);
  await page.evaluate(() =>
    localStorage.setItem('stroykontrol:demo:v1:catalog-profile:north-park', '{broken'),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Сохранённый профиль не подходит');
  await page.getByRole('button', { name: 'Сохранить профиль в браузере' }).click();
  await expect(page.getByText('Сохранённый профиль не подходит', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть пример со справочником', exact: true }).click();
  await expect(page.locator('.catalog-group')).toHaveCount(2);
  await page.getByRole('button', { name: 'Сохранить профиль в браузере' }).click();
  await expect(page.getByRole('status')).toContainText('Профиль сохранён');
  await page.getByText('Камера и возможности модели', { exact: true }).click();
  const coverage = page.getByRole('combobox', { name: 'Обзор рабочей зоны', exact: true });
  await expect(coverage).toHaveValue('adequate');
  await page.getByLabel('Зона работы', { exact: true }).fill('Другая зона');
  await expect(coverage).toHaveValue('unknown');
  await expect(page.getByText('Профиль сохранён', { exact: false })).toHaveCount(0);
});

test('work selection preserves search and returns keyboard focus to its summary', async ({ page }) => {
  await page.goto(route);
  await page.getByLabel('Поиск работы').fill('work_047');
  const choice = page.getByRole('group', { name: 'Работы справочника' }).getByRole('button');
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.catalog-picker summary')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Поиск работы')).toHaveValue('work_047');
  await expect(choice).toHaveCount(1);
});

for (const suffix of ['', '&rules=legacy']) {
  test(
    'async result import returns focus after cancel and apply ' + (suffix || 'catalog'),
    async ({ page }) => {
      await page.goto(route + suffix);
      await page.getByLabel('Снимки площадки').setInputFiles('public/inspection/pit-missing.png');
      const input = page.getByLabel('Импортировать результат анализа (JSON)');
      await expect(input).toBeVisible();
      for (const apply of [false, true]) {
        await input.focus();
        await input.setInputFiles('public/inspection/pit-missing.png.json');
        await expect(page.getByRole('dialog')).toBeVisible();
        if (apply) await page.getByRole('button', { name: 'Применить результат', exact: true }).click();
        else await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(input).toBeFocused();
      }
    },
  );
}

test('report period selector retains focus while a fresh report loads', async ({ page }) => {
  await page.goto('/objects/north-park/analytics?mode=demo');
  const period = page.getByRole('combobox', { name: 'Период отчёта', exact: true });
  await expect(page.locator('.report-mark')).toBeVisible();
  await period.focus();
  await period.selectOption('30');
  await expect(period).toBeFocused();
  await expect(page.locator('.report-mark')).toBeVisible();
  await expect(period).toBeFocused();
});

test('browser Back resolves the calendar stage from the URL again', async ({ page }) => {
  await page.goto('/objects/north-park/schedule?mode=demo');
  await page.getByRole('button', { name: 'Импорт плана', exact: true }).click();
  await page.getByLabel('Файл плана').setInputFiles({
    name: 'plan.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'id,name,start,end,zone,work_id,catalog_id\na,Этап А,2026-08-01,2026-08-31,А,work_047,construction-reviewed-2026-09-18\nb,Этап Б,2026-08-01,2026-08-31,Б,work_047,construction-reviewed-2026-09-18',
    ),
  });
  await page.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('План применён локально');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Подробности: Этап А', exact: true }).click();
  await page.getByRole('link', { name: 'Проверить снимки для этапа →' }).click();
  const stage = page.getByRole('combobox', { name: 'Строка календаря', exact: true });
  await expect(stage).toHaveValue('a');
  await stage.selectOption('b');
  await expect(stage).toHaveValue('b');
  await page.goBack();
  await expect(stage).toHaveValue('a');
  await expect(page.getByLabel('Зона работы', { exact: true })).toHaveValue('А');
  await page.goForward();
  await expect(stage).toHaveValue('b');
  await page.goBack();
  await page.getByText('Камера и возможности модели', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Обзор рабочей зоны', exact: true }).selectOption('adequate');
  await expect(stage).toHaveValue('a');
});
