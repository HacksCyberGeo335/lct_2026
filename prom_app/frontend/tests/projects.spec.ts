import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/health', (r) => r.fulfill({ json: { status: 'ok' } }));
  await page.goto('/objects');
});
async function fillObject(page: import('@playwright/test').Page) {
  await page.getByLabel('Название объекта *', { exact: true }).fill('Объект пользователя');
  await page.getByLabel('Адрес строительства *').fill('Москва, улица Строителей, 1');
  await page.getByLabel('Застройщик / заказчик *').fill('ООО Застройщик');
  await page.getByRole('button', { name: 'Продолжить к графику' }).click();
}
test('object-first draft validates stages, deletes a branch, never persists or calls an invented API', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push(r.url());
  });
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole('button', { name: 'Добавить объект', exact: true }).click();
  await fillObject(page);
  await page.getByRole('button', { name: 'Добавить этап вручную' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название этапа *').fill('Родитель');
  await dialog.getByLabel('Начало *', { exact: true }).fill('2026-10-10');
  await dialog.getByLabel('Окончание *', { exact: true }).fill('2026-10-01');
  await dialog.getByRole('button', { name: 'Применить этап к черновику' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Начало *', { exact: true }).fill('2026-10-01');
  await dialog.getByLabel('Окончание *', { exact: true }).fill('2026-10-31');
  await dialog.getByRole('button', { name: 'Применить этап к черновику' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить этап вручную' }).click();
  await dialog.getByLabel('Название этапа *').fill('Подэтап');
  await dialog.getByLabel('Начало *', { exact: true }).fill('2026-10-02');
  await dialog.getByLabel('Окончание *', { exact: true }).fill('2026-10-05');
  await dialog.getByLabel('Родительский этап', { exact: true }).selectOption({ label: 'Родитель' });
  await dialog.getByRole('button', { name: 'Применить этап к черновику' }).click();
  await expect(page.getByRole('table')).toContainText('Подэтап');
  await page.getByRole('button', { name: 'Удалить этап Родитель', exact: true }).click();
  await expect(dialog).toContainText('Всего: 2');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Подэтап');
  await page.getByRole('button', { name: 'Удалить этап Родитель', exact: true }).click();
  await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить объект и график' })).toBeDisabled();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(page.getByText('Объект пользователя', { exact: true })).toHaveCount(0);
});
test('CSV-first workflow selects destination and previews a draft without saving', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Импорт CSV графика', exact: true }).click();
  await expect(page.getByLabel('Объект для графика', { exact: true })).toHaveValue('new');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await fillObject(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Объект пользователя');
  await dialog
    .getByLabel('Файл плана')
    .setInputFiles({
      name: 'plan.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'name,start,end\nЗемляные работы,2026-10-01,2026-10-10\nФундамент,2026-10-11,2026-11-01',
      ),
    });
  await dialog.getByRole('button', { name: 'Применить план', exact: true }).click();
  await expect(dialog).toContainText('На сервер не отправлен');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Фундамент');
  await expect(page.getByRole('button', { name: 'Сохранить объект и график' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/project-draft-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Удалить график', exact: true }).click();
  await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByText('Объект пользователя', { exact: true })).toBeVisible();
});
