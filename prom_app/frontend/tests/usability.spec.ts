import { expect, test } from '@playwright/test';

test('dirty object draft blocks navigation, preserves edits on stay and discards only on confirmation', async ({
  page,
}) => {
  await page.goto('/objects');
  await page.getByRole('button', { name: 'Добавить объект', exact: true }).click();
  await page.getByLabel('Название объекта *', { exact: true }).fill('Черновик без потерь');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Покинуть страницу?' })).toBeVisible();
  await page.getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByLabel('Название объекта *', { exact: true })).toHaveValue('Черновик без потерь');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Уйти без сохранения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Настройки мониторинга', exact: true })).toBeVisible();
});

test('mobile navigation reveals every destination and analytics is not an upload screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/objects');
  await page.getByRole('button', { name: /Меню/ }).click();
  await page.getByRole('link', { name: 'Соответствие графику', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Соответствие графику', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Загрузить фото или видео', exact: true })).toHaveCount(0);
  await page.getByLabel('Период с').fill('2026-10-10');
  await page.getByLabel('По', { exact: true }).fill('2026-10-01');
  await expect(page.getByRole('alert')).toContainText('Окончание периода');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/comparison-mobile.png', fullPage: true });
});

test('catalog can add a work and a requirement and export a consistent file', async ({ page }) => {
  await page.goto('/objects/unavailable/inspection');
  await page.getByText('Управление справочником', { exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать копию', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('button', { name: 'Добавить работу', exact: true }).click();
  await editor.getByLabel('Название работы', { exact: true }).fill('Моя новая работа');
  const machine = editor.getByLabel('Техника для новой группы');
  await machine.selectOption({ index: 1 });
  await editor.getByRole('button', { name: 'Добавить группу требований', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Удалить группу требований' })).toHaveCount(1);
  await editor.getByRole('button', { name: 'Проверить и применить копию' }).click();
  await page.getByRole('button', { name: 'Применить справочник', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать справочник / шаблон' }).click();
  const file = await downloading;
  const bundle = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
  const work = bundle.equipment.works.find((w: { work_name: string }) => w.work_name === 'Моя новая работа');
  expect(work.required_equipment).toHaveLength(1);
  expect(bundle.cards.source.card_count).toBe(bundle.cards.cards.length);
  await page.getByRole('button', { name: 'Редактировать копию', exact: true }).click();
  await editor.getByLabel('Поиск работы', { exact: true }).fill('Моя новая работа');
  await editor.getByLabel('Редактируемая работа').selectOption({ label: 'Моя новая работа' });
  page.once('dialog', (d) => void d.accept());
  await editor.getByRole('button', { name: 'Удалить работу', exact: true }).click();
  await editor.getByRole('button', { name: 'Проверить и применить копию' }).click();
  await page.getByRole('button', { name: 'Применить справочник', exact: true }).click();
  await expect(page.getByRole('button', { name: /Моя новая работа/ })).toHaveCount(0);
});

test('upload window can be hidden without cancelling and a photo can be reused without another upload', async ({
  page,
}) => {
  const id = '021472d8-a659-47de-893d-bedc24d015e7';
  let puts = 0,
    completes = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/videos/init-upload', (r) =>
    r.fulfill({
      json: { uuid: id, upload_url: 'http://127.0.0.1:5173/storage/photo.png', storage_key: 'photo.png' },
    }),
  );
  await page.route('**/storage/photo.png', async (r) => {
    if (r.request().method() === 'PUT') {
      puts++;
      await gate;
      await r.fulfill({ status: 200 });
    } else await r.fulfill({ status: 404 });
  });
  await page.route('**/api/videos/*/upload-complete', (r) => {
    completes++;
    return r.fulfill({ status: 200 });
  });
  await page.goto('/objects/unavailable');
  await page.getByRole('button', { name: '+ Загрузить фото или видео' }).click();
  await page
    .getByLabel('Фото или видео', { exact: true })
    .setInputFiles('tests/fixtures/inspection/pit-missing.png');
  await page.getByRole('button', { name: 'Загрузить файлы', exact: true }).click();
  await expect.poll(() => puts).toBe(1);
  await page.getByRole('button', { name: 'Закрыть диалог' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Загрузка выполняется — открыть очередь' }).click();
  release();
  await expect(page.getByRole('dialog')).toContainText('Загружено: 1 из 1');
  await page.getByRole('button', { name: 'Перейти к файлам' }).click();
  await page.getByRole('button', { name: 'Открыть в проверке', exact: true }).click();
  await expect(page.locator('.inspection-thumb')).toHaveCount(1);
  expect(puts).toBe(1);
  expect(completes).toBe(1);
  await page.getByLabel('Уже загруженные фото').selectOption(id);
  await page.getByRole('button', { name: 'Открыть в проверке', exact: true }).click();
  await expect(page.locator('.inspection-thumb')).toHaveCount(1);
});
