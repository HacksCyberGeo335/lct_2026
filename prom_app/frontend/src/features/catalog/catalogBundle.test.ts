import { addWork, removeWork, synchronizeWork } from './catalogEditing';
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
  const work = bundle.equipment.works.find((w) => w.conditional_required_equipment.length)!;
  work.conditional_required_equipment[0].one_of = ['missing-equipment'];
  await expect(validateBundle(bundle)).rejects.toThrow('Несогласованный справочник');
  expect(builtin.works.get(work.work_id)!.conditional_required_equipment[0].one_of).not.toContain(
    'missing-equipment',
  );
});

it('new works have no inherited evidence and deleting them cleans dependencies', async () => {
  let bundle = addWork(structuredClone(bundleOf(builtin, 'Test')), 'user-new');
  const newWork = bundle.equipment.works.find((w) => w.work_id === 'user-new')!;
  expect(newWork.required_equipment).toEqual([]);
  expect(newWork.cctv.automatic_absence_alert_enabled).toBe(false);
  bundle.cards.cards[0].successor = [{ work_id: 'user-new', condition: 'После подготовки' }];
  await expect(validateBundle(bundle)).resolves.toBeDefined();
  bundle = removeWork(bundle, 'user-new');
  expect(bundle.cards.cards[0].successor).toEqual([]);
  await expect(validateBundle(bundle)).resolves.toBeDefined();
});
it('changed alternatives update detector classes and no longer retain an obsolete machine', async () => {
  let bundle = structuredClone(bundleOf(builtin, 'Test'));
  const work = bundle.equipment.works.find((w) => w.conditional_required_equipment.length)!;
  const replacement = bundle.equipment.equipment_ontology.find((e) => e.detector_classes.length)!;
  work.required_equipment = [{ ...work.conditional_required_equipment[0], one_of: [replacement.id] }];
  work.conditional_required_equipment = [];
  work.possible_equipment = [];
  bundle = synchronizeWork(bundle, work.work_id);
  const synced = bundle.equipment.works.find((w) => w.work_id === work.work_id)!;
  expect(synced.detector_classes.map((c) => c.class_id).sort()).toEqual(
    [...replacement.detector_classes].sort(),
  );
  expect(synced.equipment_classes.map((c) => c.class_id)).toEqual([replacement.id]);
  await expect(validateBundle(bundle)).resolves.toBeDefined();
});
it('reports the work and invalid field when a requirement loses all alternatives', async () => {
  const bundle = structuredClone(bundleOf(builtin, 'Test'));
  const work = bundle.equipment.works.find((w) => w.conditional_required_equipment.length)!;
  work.conditional_required_equipment[0].one_of = [];
  await expect(validateBundle(bundle)).rejects.toThrow(work.canonical_work_name);
  await expect(validateBundle(bundle)).rejects.toThrow('Альтернативы техники');
});
