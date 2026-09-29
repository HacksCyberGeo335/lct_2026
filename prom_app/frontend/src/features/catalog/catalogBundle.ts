import { z } from 'zod';
import {
  cardsSchema,
  equipmentSchema,
  durationsSchema,
  parseCatalog,
  type Catalog,
} from '../../domain/catalog';
import { detectorLabels } from '../../domain/detectorClasses';
export const bundleSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(200),
  cards: cardsSchema,
  equipment: equipmentSchema,
  durations: durationsSchema,
});
export type CatalogBundle = z.infer<typeof bundleSchema>;
export function bundleOf(catalog: Catalog, name: string): CatalogBundle {
  return {
    version: 1,
    name,
    cards: {
      schema_version: '3.1-reviewed',
      source: { sha256: 'user-copy', card_count: catalog.cards.length },
      macro_stage_definitions: catalog.categories,
      cards: catalog.cards,
    },
    equipment: {
      schema_version: '1.1',
      source: { sha256: 'user-copy' },
      works: [...catalog.works.values()],
      equipment_ontology: [...catalog.equipmentById.values()],
      detector_class_catalog: [...catalog.detectors.values()],
      sources: [...catalog.sources.values()],
    },
    durations: {
      schema_version: '1.0',
      works: [...catalog.durationWorks.values()],
      benchmarks: [...catalog.benchmarks.values()],
      sources: [...catalog.durationSources.values()],
    },
  };
}
export async function validateBundle(input: unknown) {
  const parsed = bundleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path;
    const labels: Record<string, string> = {
      name: 'Название справочника',
      cards: 'Карточки работ',
      equipment: 'Техника',
      durations: 'Сведения о сроках',
      works: 'Работы',
      canonical_work_name: 'Название работы',
      work_name: 'Название работы',
      positive_visual_signs: 'Визуальные признаки',
      one_of: 'Альтернативы техники',
      phase: 'Фаза',
      required_equipment: 'Обязательная техника',
      conditional_required_equipment: 'Условная техника',
    };
    const raw = input as Record<string, unknown>;
    const section =
      raw && typeof raw === 'object' ? (raw[String(path[0])] as Record<string, unknown>) : undefined;
    const rows = section && typeof section === 'object' ? section[String(path[1])] : undefined;
    const row =
      Array.isArray(rows) && typeof path[2] === 'number'
        ? (rows[path[2]] as Record<string, unknown>)
        : undefined;
    const name = row?.canonical_work_name ?? row?.work_name;
    throw new Error(
      (name ? 'Работа «' + String(name) + '». ' : '') +
        path
          .map((p) => (typeof p === 'number' ? 'строка ' + (p + 1) : (labels[String(p)] ?? String(p))))
          .join(' → ') +
        ': проверьте обязательное значение и формат. Для группы техники оставьте хотя бы одну альтернативу.',
    );
  }
  const bundle = parsed.data;
  if (bundle.equipment.detector_class_catalog.some((item) => !Object.hasOwn(detectorLabels, item.class_id)))
    throw new Error(
      'В справочнике есть классы детектора, которые пока не поддерживаются интерфейсом. Используйте классы из шаблона.',
    );
  const catalog = parseCatalog(
    'custom-' + crypto.randomUUID(),
    bundle.cards,
    bundle.equipment,
    bundle.durations,
  );
  if (!crypto.subtle) throw new Error('Откройте приложение через HTTPS или localhost.');
  const canonical = bundleOf(catalog, bundle.name);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  catalog.id =
    'custom-' + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { bundle: canonical, catalog };
}
export async function readCatalogBundle(file: File) {
  if (!file.name.toLowerCase().endsWith('.json') || file.size > 8 * 1024 * 1024 || !file.size)
    throw new Error('Выберите JSON справочника размером до 8 МБ. Формат доступен в скачиваемом шаблоне.');
  return validateBundle(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())),
  );
}
