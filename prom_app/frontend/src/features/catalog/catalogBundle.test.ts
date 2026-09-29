import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseCatalog } from '../../domain/catalog';
import { bundleOf, validateBundle } from './catalogBundle';
const manifest = JSON.parse(readFileSync('public/catalog/manifest.json', 'utf8'));
const files = ['cards', 'equipment', 'durations'].map((key) =>
  JSON.parse(readFileSync('public/catalog/' + manifest.files[key].file, 'utf8')),
);
const builtin = parseCatalog(manifest.id, files[0], files[1], files[2]);
it('catalog export and import preserve matching rules and a stable content identity', async () => {
  const bundle = bundleOf(builtin, 'Справочник пользователя');
  const first = await validateBundle(bundle);
  const second = await validateBundle(bundleOf(first.catalog, bundle.name));
  expect(first.catalog.id).toBe(second.catalog.id);
  expect(first.catalog.id).not.toBe(builtin.id);
  expect(first.catalog.cards).toEqual(builtin.cards);
  expect([...first.catalog.works.values()]).toEqual([...builtin.works.values()]);
  const changed = await validateBundle({ ...bundle, name: 'Другая версия' });
  expect(changed.catalog.id).not.toBe(first.catalog.id);
});
it('rejects broken cross references without altering the built-in catalog', async () => {
  const bundle = structuredClone(bundleOf(builtin, 'Мой справочник'));
  const work = bundle.equipment.works.find((w) => w.required_equipment.length)!;
  work.required_equipment[0].one_of = ['missing-equipment'];
  await expect(validateBundle(bundle)).rejects.toThrow('Несогласованный справочник');
  expect(builtin.works.get(work.work_id)!.required_equipment[0].one_of).not.toContain('missing-equipment');
});
