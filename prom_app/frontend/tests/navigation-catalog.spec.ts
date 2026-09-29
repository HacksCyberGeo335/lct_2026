import { expect, test } from '@playwright/test';
test('site and settings retain their own purpose without object editing blocks', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'DELETE'].includes(r.method())) writes.push(r.url());
  });
  await page.goto('/objects/unavailable?mode=api');
  await expect(page.getByRole('heading', { name: 'Техника в кадре', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Фото и видео площадки', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить объект', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/site-restored.png', fullPage: true });
  await page.goto('/objects/unavailable/settings?mode=api');
  await expect(page.getByRole('heading', { name: 'Почтовая рассылка' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить объект', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch')).toHaveCount(3);
  await page.getByRole('switch', { name: 'Сводка о ходе строительства' }).click();
  await expect(page.getByRole('switch', { name: 'Сводка о ходе строительства' })).toBeChecked();
  await page.getByLabel('Адреса электронной почты').fill('wrong-address');
  await expect(page.getByRole('alert')).toContainText('Проверьте адреса');
  await page.getByLabel('Адреса электронной почты').fill('engineer@example.com');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить настройки — API не подключён' })).toBeDisabled();
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/settings-restored.png', fullPage: true });
});
test('custom catalog edits are confirmed, survive navigation, export and restore without overwriting built-in', async ({
  page,
}) => {
  await page.goto('/objects/unavailable/inspection?mode=api');
  const manager = page.getByRole('region', { name: 'Управление справочником' });
  await expect(manager.getByRole('button', { name: 'Редактировать копию' })).toBeEnabled();
  await manager.getByRole('button', { name: 'Редактировать копию' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название справочника', { exact: true }).fill('Каталог команды');
  await dialog.getByLabel('Название работы', { exact: true }).fill('Работа пользователя');
  await dialog.getByRole('button', { name: 'Проверить и применить копию' }).click();
  await page.getByRole('button', { name: 'Применить справочник', exact: true }).click();
  await expect(manager).toContainText('Каталог команды');
  await expect(page.getByRole('button', { name: /Работа пользователя/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await manager.getByRole('button', { name: 'Скачать справочник / шаблон' }).click();
  const file = await download;
  const path = await file.path();
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('link', { name: 'Снимки и отклонения', exact: true }).click();
  await expect(manager).toContainText('Каталог команды');
  await manager.getByRole('button', { name: 'Использовать встроенный' }).click();
  await page.getByRole('button', { name: 'Применить справочник', exact: true }).click();
  await expect(manager).toContainText('Встроенный справочник');
  await expect(page.getByRole('button', { name: /Работа пользователя/ })).toHaveCount(0);
  await manager
    .getByLabel('Файл справочника')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(manager.getByRole('alert')).toBeVisible();
  await expect(manager).toContainText('Встроенный справочник');
  await manager
    .getByLabel('Файл справочника')
    .setInputFiles({
      name: 'own.json',
      mimeType: 'application/json',
      buffer: await (await import('node:fs/promises')).readFile(path!),
    });
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Применить справочник', exact: true }).click();
  await expect(manager).toContainText('Каталог команды');
});
