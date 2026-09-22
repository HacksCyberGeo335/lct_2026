import { z } from 'zod';
import { dateSchema } from './models';
import { moscowDate, type InspectionFrame } from './inspection';
import type { Catalog, Requirement } from './catalog';
import { detectorClass } from './detectorClasses';

const optionalDate = z.union([z.literal(''), dateSchema]);
const localTime = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) &&
        dateSchema.safeParse(v.slice(0, 10)).success &&
        Number(v.slice(11, 13)) < 24 &&
        Number(v.slice(14, 16)) < 60),
    'Интервал: укажите существующую дату и время с точностью до минуты.',
  );
export const profileSchema = z
  .object({
    version: z.literal(1),
    catalogId: z.string().min(1),
    siteId: z.string().min(1),
    workId: z.string(),
    planSource: z.enum(['operator', 'calendar']),
    stageId: z.string(),
    zone: z.string().max(120),
    start: optionalDate,
    end: optionalDate,
    phases: z.array(z.string()).max(50),
    conditions: z.record(z.string(), z.string()),
    alternatives: z.record(z.string(), z.array(z.string()).max(127)),
    coverage: z.enum(['unknown', 'adequate', 'occluded']),
    observationMode: z.enum(['single', 'window']),
    cameraId: z.string().max(120),
    modelId: z.string().max(120),
    windowStart: localTime,
    windowEnd: localTime,
    minFrames: z.number().int().min(2).max(50).nullable(),
    maxGapMinutes: z.number().positive().max(10080).nullable(),
    confidence: z.number().min(0).max(1),
    detectorValidated: z.boolean(),
    supportedClasses: z.array(z.string()).max(128),
    kind: z.enum(['draft', 'demo']),
  })
  .refine((p) => !p.start || !p.end || p.start <= p.end, 'Начало плана позже окончания.');
export type CatalogProfile = z.infer<typeof profileSchema>;
export function emptyProfile(siteId: string, catalogId: string): CatalogProfile {
  return {
    version: 1,
    catalogId,
    siteId,
    workId: '',
    planSource: 'operator',
    stageId: '',
    zone: '',
    start: '',
    end: '',
    phases: [],
    conditions: {},
    alternatives: {},
    coverage: 'unknown',
    observationMode: 'single',
    cameraId: '',
    modelId: '',
    windowStart: '',
    windowEnd: '',
    minFrames: null,
    maxGapMinutes: null,
    confidence: 0.5,
    detectorValidated: false,
    supportedClasses: [],
    kind: 'draft',
  };
}
export function validateProfile(value: unknown, catalog: Catalog, siteId: string) {
  const p = profileSchema.parse(value);
  if (p.catalogId !== catalog.id)
    throw new Error('Версия справочника профиля не совпадает. Требуется повторное сопоставление.');
  if (p.siteId !== siteId) throw new Error('Профиль относится к другому объекту.');
  if (p.workId && !catalog.works.has(p.workId)) throw new Error('Работа профиля отсутствует в справочнике.');
  const groups = allRequirements(catalog, p.workId);
  if (p.phases.some((phase) => !groups.some((g) => g.phase === phase)))
    throw new Error('Фаза отсутствует у выбранной работы.');
  for (const [id, values] of Object.entries(p.alternatives)) {
    const group = groups.find((g) => g.requirement_id === id);
    if (!group || values.some((v) => !group.one_of.includes(v)))
      throw new Error('Неизвестная альтернатива правила.');
  }
  const keys = new Set(groups.flatMap((g) => Object.keys(g.when)));
  if (Object.keys(p.conditions).some((k) => !keys.has(k)))
    throw new Error('Условие не относится к выбранной работе.');
  if (
    Object.entries(p.conditions).some(
      ([key, value]) => value && value !== 'other' && !groups.some((g) => g.when[key] === value),
    )
  )
    throw new Error('Неизвестное значение условия метода.');
  if (p.supportedClasses.some((c) => !catalog.detectors.has(c)))
    throw new Error('Неизвестный класс профиля модели.');
  return p;
}
export function allRequirements(catalog: Catalog, workId: string) {
  const w = catalog.works.get(workId);
  return w ? [...w.required_equipment, ...w.conditional_required_equipment] : [];
}
export type GroupState = 'unknown' | 'not-applicable' | 'inactive' | 'observed' | 'not-observed';
export const groupLabels: Record<GroupState, string> = {
  unknown: 'Недостаточно данных',
  'not-applicable': 'Условие не применяется',
  inactive: 'Фаза не активна',
  observed: 'Есть связанный класс техники',
  'not-observed': 'Не обнаружено в наблюдениях',
};
export interface GroupResult {
  group: Requirement;
  state: GroupState;
  explanation: string;
  evidenceIds: string[];
}
const zoneKey = (zone: string) => zone.trim().toLocaleLowerCase('ru');
export function evaluateCatalog(
  catalog: Catalog,
  p: CatalogProfile,
  frames: InspectionFrame[],
  selected?: InspectionFrame,
  bindingError = '',
) {
  const card = catalog.cardsById.get(p.workId),
    work = catalog.works.get(p.workId);
  const issues: string[] = [];
  try {
    validateProfile(p, catalog, p.siteId);
  } catch {
    issues.push(
      'Профиль содержит некорректные настройки. Проверьте работу, даты, условия и числовые пороги.',
    );
  }
  if (bindingError) issues.push(bindingError);
  let observations: InspectionFrame[] = [];
  const single = p.observationMode === 'single';
  if (!p.zone.trim()) issues.push('Укажите зону плановой работы.');
  if (p.start && p.end && p.start > p.end) issues.push('Начало плана позже окончания.');
  if (p.planSource === 'calendar' && (!p.stageId || !p.start || !p.end))
    issues.push('Выберите строку календарного плана.');
  if (p.coverage !== 'adequate')
    issues.push(
      p.coverage === 'occluded' ? 'Рабочая зона закрыта от камеры.' : 'Обзор рабочей зоны не подтверждён.',
    );
  if (!p.detectorValidated || !p.supportedClasses.length)
    issues.push('Не подтверждены возможности и порог модели.');
  if (!p.modelId.trim() || !p.cameraId.trim())
    issues.push('Укажите камеру и точное название модели из результата, для которых настроен профиль.');
  const validResult = (f: InspectionFrame) => {
    const r = f.result;
    return (
      !!r &&
      r.state === 'succeeded' &&
      r.quality.usable &&
      r.camera_id === p.cameraId &&
      r.model === p.modelId &&
      zoneKey(r.zone) === zoneKey(p.zone) &&
      (!p.start || moscowDate(r.captured_at) >= p.start) &&
      (!p.end || moscowDate(r.captured_at) <= p.end)
    );
  };
  if (single) {
    if (!selected?.result) issues.push('Выберите снимок с результатом анализа.');
    else if (!validResult(selected))
      issues.push(
        'Результат не подходит по камере, модели, зоне, периоду, качеству или состоянию обработки.',
      );
    else observations = [selected];
  } else {
    // datetime-local is always interpreted as Moscow, independently of the browser timezone.
    const from = Date.parse(p.windowStart + ':00+03:00'),
      to = Date.parse(p.windowEnd + ':00+03:00');
    if (!p.cameraId || !Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      issues.push('Задайте камеру и корректный интервал по московскому времени.');
    else {
      const inWindow = frames.filter(
        (f) =>
          f.result?.camera_id === p.cameraId &&
          zoneKey(f.result.zone) === zoneKey(p.zone) &&
          Date.parse(f.result.captured_at) >= from &&
          Date.parse(f.result.captured_at) <= to,
      );
      observations = inWindow
        .filter(validResult)
        .sort((a, b) => Date.parse(a.result!.captured_at) - Date.parse(b.result!.captured_at));
      if (inWindow.length !== observations.length)
        issues.push('В интервале есть непригодные или незавершённые результаты.');
      const instants = [...new Set(observations.map((f) => Date.parse(f.result!.captured_at)))];
      if (!p.minFrames || !p.maxGapMinutes)
        issues.push('Задайте минимальное число моментов наблюдения и допустимый перерыв.');
      else {
        if (instants.length < p.minFrames) issues.push('Недостаточно разных моментов наблюдения.');
        const times = [from, ...instants, to];
        if (times.some((t, i) => i > 0 && t - times[i - 1] > p.maxGapMinutes! * 60_000))
          issues.push('Есть непокрытый перерыв в наблюдениях, включая границы интервала.');
      }
    }
  }
  const groups: GroupResult[] =
    !card || !work || card.row_kind === 'AGGREGATE'
      ? []
      : allRequirements(catalog, p.workId).map((group) => {
          const base = { group, evidenceIds: [] as string[] };
          const conditions = Object.entries(group.when);
          if (conditions.some(([key, value]) => p.conditions[key] && p.conditions[key] !== value))
            return {
              ...base,
              state: 'not-applicable',
              explanation: 'Выбранный метод не выполняет условие: ' + group.condition,
            };
          if (conditions.some(([key]) => !p.conditions[key]))
            return { ...base, state: 'unknown', explanation: 'Не задано условие метода: ' + group.condition };
          if (!p.phases.length)
            return { ...base, state: 'unknown', explanation: 'Не выбрана активная фаза работ.' };
          if (!p.phases.includes(group.phase))
            return {
              ...base,
              state: 'inactive',
              explanation: 'Требование относится к фазе «' + group.phase + '».',
            };
          if (issues.length) return { ...base, state: 'unknown', explanation: issues.join(' ') };
          const chosen = p.alternatives[group.requirement_id] ?? [];
          if (!chosen.length)
            return {
              ...base,
              state: 'unknown',
              explanation:
                'Выберите допустимые для проекта альтернативы. Справочный список не исчерпывающий.',
            };
          const alternatives = chosen.map((id) => catalog.equipmentById.get(id)!);
          const supported = new Set(p.supportedClasses);
          const classes = new Set(
            alternatives.flatMap((e) => e.detector_classes).filter((c) => supported.has(c)),
          );
          const matches = observations.filter((f) =>
            f.result!.detections.some(
              (d) => classes.has(detectorClass(d.class_id)) && d.confidence >= p.confidence,
            ),
          );
          if (matches.length)
            return {
              group,
              state: 'observed',
              evidenceIds: matches.map((f) => f.id),
              explanation:
                'Виден совместимый укрупнённый класс. Подтип, оснастка, пригодность и выполнение функции этим не подтверждены.',
            };
          if (
            alternatives.some(
              (e) => !e.detector_classes.length || !e.detector_classes.some((c) => supported.has(c)),
            )
          )
            return {
              ...base,
              state: 'unknown',
              explanation:
                'Не все выбранные альтернативы доступны детектору. Отсутствие инструмента по камере не подтверждается.',
            };
          const uncertainty = observations.some((f) =>
            f.result!.detections.some(
              (d) =>
                !catalog.detectors.has(detectorClass(d.class_id)) ||
                (classes.has(detectorClass(d.class_id)) && d.confidence < p.confidence),
            ),
          );
          if (uncertainty)
            return {
              ...base,
              state: 'unknown',
              explanation: 'Есть неизвестная техника или подходящая детекция ниже выбранного порога.',
            };
          return {
            group,
            state: 'not-observed',
            evidenceIds: observations.map((f) => f.id),
            explanation: single
              ? 'Подходящий класс не обнаружен на этом снимке. Один кадр не доказывает отсутствие техники.'
              : 'Подходящий класс не обнаружен в выбранных наблюдениях. Это не подтверждённое нарушение.',
          };
        });
  const possibleClasses = new Set(work?.detector_classes.map((d) => d.class_id) ?? []);
  const unlisted = [
    ...new Set(
      observations.flatMap((f) =>
        f
          .result!.detections.filter((d) => d.confidence >= p.confidence)
          .map((d) => detectorClass(d.class_id)),
      ),
    ),
  ].filter((c) => !possibleClasses.has(c));
  return {
    groups,
    issues,
    observations,
    unlisted,
    automaticAlertEnabled: false as const,
    reason: work?.cctv.reason ?? 'Выберите работу из справочника.',
  };
}
