import type { CatalogBundle } from './catalogBundle';
export function addWork(bundle: CatalogBundle, id: string): CatalogBundle {
  const name = 'Новая работа';
  return {
    ...bundle,
    cards: {
      ...bundle.cards,
      source: { ...bundle.cards.source, card_count: bundle.cards.cards.length + 1 },
      cards: [
        ...bundle.cards.cards,
        {
          id,
          work_name: name,
          canonical_work_name: name,
          row_kind: 'ITEM',
          macro_stage: Object.keys(bundle.cards.macro_stage_definitions)[0],
          applicable_object_types: [],
          source: { row: 0, cell: 'user', context: [] },
          external_camera_observability: 0,
          observability_note: 'Оценка не задана пользователем',
          positive_visual_signs: [],
          predecessor: 'UNKNOWN',
          successor: 'UNKNOWN',
        },
      ],
    },
    equipment: {
      ...bundle.equipment,
      works: [
        ...bundle.equipment.works,
        {
          work_id: id,
          work_name: name,
          canonical_work_name: name,
          row_kind: 'ITEM',
          equipment_classes: [],
          detector_classes: [],
          required_equipment: [],
          conditional_required_equipment: [],
          possible_equipment: [],
          requirement_status: 'NO_CONSTRUCTION_EQUIPMENT_REQUIREMENT',
          review_notes: [],
          cctv: {
            requires_project_configuration: true,
            automatic_absence_alert_enabled: false,
            reason: 'Требуется настройка пользователем',
            candidate_detector_classes: [],
            external_view_limitation: '',
          },
        },
      ],
    },
    durations: {
      ...bundle.durations,
      works: [
        ...bundle.durations.works,
        {
          work_id: id,
          work_name: name,
          row_kind: 'ITEM',
          benchmarks: [],
          review: 'Задано пользователем',
          missing_inputs: 'Не заданы',
          verified_population_mean: null,
        },
      ],
    },
  };
}
export function removeWork(bundle: CatalogBundle, id: string): CatalogBundle {
  if (bundle.cards.cards.length <= 1) throw new Error('Оставьте хотя бы одну работу.');
  return {
    ...bundle,
    cards: {
      ...bundle.cards,
      source: { ...bundle.cards.source, card_count: bundle.cards.cards.length - 1 },
      cards: bundle.cards.cards
        .filter((c) => c.id !== id)
        .map((c) => ({
          ...c,
          predecessor:
            c.predecessor === 'UNKNOWN' ? 'UNKNOWN' : c.predecessor.filter((l) => l.work_id !== id),
          successor: c.successor === 'UNKNOWN' ? 'UNKNOWN' : c.successor.filter((l) => l.work_id !== id),
        })),
    },
    equipment: { ...bundle.equipment, works: bundle.equipment.works.filter((w) => w.work_id !== id) },
    durations: { ...bundle.durations, works: bundle.durations.works.filter((w) => w.work_id !== id) },
  };
}
export function synchronizeWork(bundle: CatalogBundle, id: string): CatalogBundle {
  return {
    ...bundle,
    equipment: {
      ...bundle.equipment,
      works: bundle.equipment.works.map((w) => {
        if (w.work_id !== id) return w;
        const groups = [...w.required_equipment, ...w.conditional_required_equipment];
        const equipment = [
          ...new Set([
            ...groups.flatMap((g) => g.one_of),
            ...w.possible_equipment.map((e) => e.equipment_id),
          ]),
        ]
          .map((id) => bundle.equipment.equipment_ontology.find((e) => e.id === id)!)
          .filter(Boolean);
        const classes = [...new Set(equipment.flatMap((e) => e.detector_classes))];
        return {
          ...w,
          equipment_classes: equipment.map((e) => ({
            class_id: e.id,
            name_ru: e.name_ru,
            name_en: e.name_en,
          })),
          detector_classes: bundle.equipment.detector_class_catalog.filter((c) =>
            classes.includes(c.class_id),
          ),
          requirement_status:
            w.row_kind === 'AGGREGATE'
              ? 'AGGREGATE_SELECT_OPERATION'
              : w.required_equipment.length
                ? 'FUNCTIONAL_REQUIREMENT_IDENTIFIED'
                : w.conditional_required_equipment.length
                  ? 'CONDITIONAL_ON_METHOD'
                  : 'NO_CONSTRUCTION_EQUIPMENT_REQUIREMENT',
          cctv: { ...w.cctv, candidate_detector_classes: classes, automatic_absence_alert_enabled: false },
        };
      }),
    },
  };
}
