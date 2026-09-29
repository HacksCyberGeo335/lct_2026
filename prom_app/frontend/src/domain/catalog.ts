import { z } from 'zod';
const text = z.string().min(1);
const names = z.object({ class_id: text, name_ru: text, name_en: text });
const source = z.object({
  id: text,
  title: text,
  url: z.string(),
  locator: z.string().optional(),
  supports: z.string().optional(),
  finding: z.string().optional(),
  access: z.string().optional(),
  checked_on: z.string().optional(),
});
const link = z.object({ work_id: text, condition: text });
export const requirementSchema = z.object({
  requirement_id: text,
  relation: z.enum(['REQUIRES', 'CONDITIONAL']),
  functional_equipment_id: text,
  equipment_name_ru: text,
  one_of: z.array(text).min(1),
  phase: text,
  when: z.record(z.string(), text),
  condition: text,
  rationale: text,
  evidence_level: text,
  source_ids: z.array(text),
  alternatives_exhaustive: z.boolean(),
  alternative_selection: text,
});
const relation = z.object({
  equipment_id: text,
  equipment_name_ru: text,
  equipment_name_en: text,
  relation: z.enum(['EXPECTED', 'MAY_USE']),
  condition: z.string(),
  evidence_level: text,
  source_ids: z.array(text),
});
const ontology = z.object({
  id: text,
  name_ru: text,
  name_en: text,
  aliases: z.array(z.string()),
  kind: text,
  cctv_visibility: text,
  detector_classes: z.array(text),
});
const rowKind = z.enum(['ITEM', 'AGGREGATE']);
export const requirementStatuses = {
  AGGREGATE_SELECT_OPERATION: 'Сводный раздел — выберите операцию',
  NO_CONSTRUCTION_EQUIPMENT_REQUIREMENT: 'Требования к строительной технике не назначены',
  METHOD_OR_COMPONENTS_UNSPECIFIED: 'Нужно уточнить метод или состав работы',
  CONDITIONAL_ON_METHOD: 'Требования зависят от метода',
  NO_UNIVERSAL_MACHINE_IDENTIFIED: 'Универсально обязательная машина не установлена',
  FUNCTIONAL_REQUIREMENT_IDENTIFIED: 'Определена необходимая функция',
} as const;
const status = z.enum(
  Object.keys(requirementStatuses) as [
    keyof typeof requirementStatuses,
    ...Array<keyof typeof requirementStatuses>,
  ],
);
const card = z.object({
  id: text,
  work_name: text,
  canonical_work_name: text,
  row_kind: rowKind,
  macro_stage: text,
  applicable_object_types: z.array(text),
  source: z.object({ row: z.number().int(), cell: text, context: z.array(text) }),
  external_camera_observability: z.number().min(0).max(1),
  observability_note: z.string(),
  positive_visual_signs: z.array(text),
  visual_criteria: z
    .object({
      not_started: z.string(),
      start: z.string(),
      progress: z.string(),
      completion: z.string(),
      limitations: z.string(),
      duration_status: z.string(),
    })
    .optional(),
  predecessor: z.union([z.literal('UNKNOWN'), z.array(link)]),
  successor: z.union([z.literal('UNKNOWN'), z.array(link)]),
});
const work = z.object({
  work_id: text,
  work_name: text,
  canonical_work_name: text,
  row_kind: rowKind,
  equipment_classes: z.array(names),
  detector_classes: z.array(names),
  required_equipment: z.array(requirementSchema),
  conditional_required_equipment: z.array(requirementSchema),
  possible_equipment: z.array(relation),
  requirement_status: status,
  review_notes: z.array(text),
  cctv: z.object({
    requires_project_configuration: z.boolean(),
    automatic_absence_alert_enabled: z.boolean(),
    reason: text,
    candidate_detector_classes: z.array(text),
    external_view_limitation: z.string(),
  }),
});
export const cardsSchema = z.object({
  schema_version: z.literal('3.1-reviewed'),
  source: z.object({ sha256: text, card_count: z.number().int() }),
  macro_stage_definitions: z.record(z.string(), z.string()),
  cards: z.array(card).min(1).max(3000),
});
export const equipmentSchema = z.object({
  schema_version: z.literal('1.1'),
  source: z.object({ sha256: text }),
  works: z.array(work).min(1).max(3000),
  equipment_ontology: z.array(ontology),
  detector_class_catalog: z.array(names),
  sources: z.array(source),
});
const benchmark = z.object({
  id: text,
  title: text,
  source_id: text,
  value: z.number(),
  low: z.number().nullable(),
  high: z.number().nullable(),
  unit: text,
  basis: text,
  scope: text,
  resources: text,
  formula: text,
  limits: text,
  value_kind: text,
});
export const durationsSchema = z.object({
  schema_version: z.literal('1.0'),
  sources: z.array(source),
  benchmarks: z.array(benchmark),
  works: z.array(
    z.object({
      work_id: text,
      work_name: text,
      row_kind: rowKind,
      benchmarks: z.array(z.object({ benchmark_id: text, coverage: text })),
      review: text,
      missing_inputs: text,
      verified_population_mean: z.null(),
    }),
  ),
});
export type WorkCard = z.infer<typeof card>;
export type EquipmentWork = z.infer<typeof work>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Equipment = z.infer<typeof ontology>;
export type Catalog = ReturnType<typeof parseCatalog>;

function index<T>(items: T[], key: (item: T) => string) {
  const map = new Map(items.map((item) => [key(item), item]));
  if (map.size !== items.length) throw new Error('Справочник содержит повторяющиеся ID.');
  return map;
}
export function parseCatalog(id: string, rawCards: unknown, rawEquipment: unknown, rawDurations: unknown) {
  const cards = cardsSchema.parse(rawCards),
    equipment = equipmentSchema.parse(rawEquipment),
    durations = durationsSchema.parse(rawDurations);
  const cardsById = index(cards.cards, (c) => c.id),
    works = index(equipment.works, (w) => w.work_id),
    equipmentById = index(equipment.equipment_ontology, (e) => e.id),
    detectors = index(equipment.detector_class_catalog, (c) => c.class_id),
    sources = index(equipment.sources, (s) => s.id),
    durationWorks = index(durations.works, (w) => w.work_id),
    benchmarks = index(durations.benchmarks, (b) => b.id),
    durationSources = index(durations.sources, (s) => s.id);
  const require = (ok: boolean, reason: string) => {
    if (!ok) throw new Error('Несогласованный справочник: ' + reason);
  };
  require(cards.source.sha256 === equipment.source.sha256, 'разные исходные таблицы');
  require(cards.cards.length === cards.source.card_count &&
    works.size === cardsById.size &&
    durationWorks.size === cardsById.size, 'состав работ отличается');
  for (const c of cards.cards) {
    const w = works.get(c.id),
      duration = durationWorks.get(c.id);
    require(!!w &&
      w.work_name === c.work_name &&
      w.row_kind === c.row_kind &&
      duration?.work_name === c.work_name, c.id);
    require(Object.hasOwn(cards.macro_stage_definitions, c.macro_stage), 'категория ' + c.id);
    for (const links of [c.predecessor, c.successor])
      if (links !== 'UNKNOWN')
        for (const l of links) require(cardsById.has(l.work_id), 'зависимость ' + l.work_id);
  }
  for (const w of equipment.works) {
    const groups = [...w.required_equipment, ...w.conditional_required_equipment];
    index(groups, (g) => g.requirement_id);
    require(w.row_kind !== 'AGGREGATE' || !groups.length, 'требования у сводного раздела');
    for (const g of groups) {
      require(equipmentById.has(g.functional_equipment_id) &&
        g.one_of.every((e) => equipmentById.has(e)), 'альтернативы ' + g.requirement_id);
      require(g.source_ids.every((s) => sources.has(s)), 'источники ' + g.requirement_id);
    }
    for (const r of w.possible_equipment)
      require(equipmentById.has(r.equipment_id) && r.source_ids.every((s) => sources.has(s)), 'связь ' +
        w.work_id);
    require(w.equipment_classes.every((e) => equipmentById.has(e.class_id)) &&
      w.detector_classes.every((e) => detectors.has(e.class_id)), 'классы ' + w.work_id);
  }
  for (const e of equipment.equipment_ontology)
    require(e.detector_classes.every((c) => detectors.has(c)), e.id);
  for (const w of durations.works)
    require(w.benchmarks.every((b) => benchmarks.has(b.benchmark_id)), 'длительности ' + w.work_id);
  for (const b of durations.benchmarks)
    require(durationSources.has(b.source_id), 'источник длительности ' + b.id);
  return {
    id,
    cards: cards.cards,
    cardsById,
    works,
    equipmentById,
    detectors,
    sources,
    categories: cards.macro_stage_definitions,
    durationWorks,
    benchmarks,
    durationSources,
  };
}
export function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
