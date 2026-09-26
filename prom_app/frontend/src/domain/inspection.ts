import { z } from 'zod';
import { dateSchema, equipmentClass, equipmentInfo, type Stage } from './models';
import { leafStages, resourcesOf } from './plan';

export const confidenceThreshold = 0.5;
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((s) => dateSchema.safeParse(s.slice(0, 10)).success);
export const imageDetectionSchema = z.object({
  id: z.string().min(1).max(100),
  class_id: z.string().trim().min(1).max(80),
  confidence: z.number().min(0).max(1),
  bbox: z
    .tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().positive().max(1),
      z.number().positive().max(1),
    ])
    .refine(([x, y, w, h]) => x + w <= 1.000001 && y + h <= 1.000001, 'Рамка выходит за границы снимка'),
});
export const analysisResultSchema = z
  .object({
    version: z.literal(1),
    image: z.object({
      name: z.string().min(1).max(255),
      sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      width: z.number().int().positive().max(20000),
      height: z.number().int().positive().max(20000),
    }),
    captured_at: timestamp,
    camera_id: z.string().trim().min(1).max(120),
    zone: z.string().trim().min(1).max(120),
    state: z.enum(['waiting', 'running', 'succeeded', 'failed']),
    model: z.string().trim().min(1).max(120),
    quality: z.object({ usable: z.boolean(), reason: z.string().max(500) }),
    error: z.string().max(500).nullable(),
    detections: z.array(imageDetectionSchema).max(2000),
  })
  .superRefine((result, ctx) => {
    if (new Set(result.detections.map((d) => d.id)).size !== result.detections.length)
      ctx.addIssue({ code: 'custom', message: 'ID детекций повторяются.' });
    if (result.state !== 'succeeded' && result.detections.length)
      ctx.addIssue({ code: 'custom', message: 'Незавершённый анализ не должен содержать детекции.' });
    if (result.state === 'failed' && !result.error)
      ctx.addIssue({ code: 'custom', message: 'Для ошибки анализа укажите причину.' });
    if (!result.quality.usable && !result.quality.reason.trim())
      ctx.addIssue({ code: 'custom', message: 'Укажите причину непригодности снимка.' });
  });
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type ImageDetection = z.infer<typeof imageDetectionSchema>;
export interface InspectionFrame {
  id: string;
  name: string;
  url: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  origin: 'local' | 'demo';
  resultSource?: 'import' | 'demo';
  result: AnalysisResult | null;
}
export type AssessmentStatus = 'warning' | 'ok' | 'insufficient' | 'inactive' | 'other-zone' | 'no-rule';
export interface Assessment {
  stage: Stage;
  frameId: string;
  status: AssessmentStatus;
  reason: string;
  resources: { classId: string; expected: number; observed: number | null }[];
  unexpected: { classId: string; count: number }[];
  date: string | null;
}
export const assessmentLabels: Record<AssessmentStatus, string> = {
  warning: 'Выявлено отклонение',
  ok: 'Отклонений не обнаружено',
  insufficient: 'Недостаточно наблюдений',
  inactive: 'Этап не активен',
  'other-zone': 'Другая зона',
  'no-rule': 'Правило не задано',
};
export function moscowDate(timestamp: string) {
  // Calendar plans use Moscow dates; an offset near midnight can change the date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}
export function evaluateFrame(stages: Stage[], frame: InspectionFrame): Assessment[] {
  const result = frame.result;
  const date = result ? moscowDate(result.captured_at) : null;
  const leaves = leafStages(stages);
  const active = leaves.filter(
    (s) =>
      date &&
      s.start <= date &&
      s.end >= date &&
      s.zone.trim().toLocaleLowerCase('ru') === result?.zone.toLocaleLowerCase('ru'),
  );
  // Concurrent stages in one zone share the allowed equipment set, avoiding false positives.
  const allowed = new Set(active.flatMap((s) => resourcesOf(s).map((r) => r.equipment)));
  const hasUnspecifiedRule = active.some((s) => !resourcesOf(s).length);
  const accepted = result?.detections.filter((d) => d.confidence >= confidenceThreshold) ?? [];
  const uncertain =
    result?.detections.some(
      (d) => d.confidence < confidenceThreshold || !equipmentClass.safeParse(d.class_id).success,
    ) ?? false;
  return leaves.map((stage) => {
    const resources = resourcesOf(stage)
      .filter((r) => r.quantity > 0)
      .map((r) => ({ classId: r.equipment, expected: r.quantity, observed: null as number | null }));
    const base: Assessment = {
      stage,
      frameId: frame.id,
      date,
      resources,
      unexpected: [],
      status: 'insufficient',
      reason: 'Результат анализа этого снимка ещё не получен.',
    };
    if (!result || !date) return base;
    if (stage.start > date || stage.end < date)
      return { ...base, status: 'inactive', reason: 'Дата снимка вне планового периода этапа.' };
    if (stage.zone.trim().toLocaleLowerCase('ru') !== result.zone.toLocaleLowerCase('ru'))
      return {
        ...base,
        status: 'other-zone',
        reason: 'Наблюдения относятся к зоне «' + result.zone + '», а не к зоне этого этапа.',
      };
    if (!resources.length)
      return { ...base, status: 'no-rule', reason: 'Для этапа не заданы требования к технике.' };
    if (result.state !== 'succeeded')
      return {
        ...base,
        reason:
          result.state === 'failed' ? 'Ошибка анализа: ' + result.error : 'Анализ снимка ещё не завершён.',
      };
    if (!result.quality.usable)
      return { ...base, reason: 'Снимок непригоден для вывода: ' + result.quality.reason };
    for (const resource of resources)
      resource.observed = accepted.filter((d) => d.class_id === resource.classId).length;
    const missing = resources.filter((r) => r.observed! < r.expected);
    const unexpected =
      stage.rulePolicy === 'required-only' || hasUnspecifiedRule
        ? []
        : [...new Set(accepted.map((d) => d.class_id))]
            .filter(
              (id) =>
                equipmentClass.safeParse(id).success && !allowed.has(id as z.infer<typeof equipmentClass>),
            )
            .map((classId) => ({ classId, count: accepted.filter((d) => d.class_id === classId).length }));
    if (uncertain)
      return {
        ...base,
        resources,
        reason:
          'Есть неизвестные классы или детекции ниже порога уверенности. Требуется проверка снимка; отсутствие техники не подтверждено.',
      };
    if (hasUnspecifiedRule && stage.rulePolicy !== 'required-only')
      return {
        ...base,
        resources,
        reason:
          'У параллельного этапа в этой зоне не задано правило. Нельзя проверить допустимость всей техники.',
      };
    const reasons = [
      missing.length
        ? 'Не хватает необходимой техники: ' +
          missing
            .map(
              (r) =>
                equipmentInfo(r.classId).plural + ' — ожидается ' + r.expected + ', обнаружено ' + r.observed,
            )
            .join('; ') +
          '.'
        : '',
      unexpected.length
        ? 'Техника не соответствует активным этапам зоны: ' +
          unexpected.map((r) => equipmentInfo(r.classId).plural + ' — ' + r.count).join('; ') +
          '.'
        : '',
    ].filter(Boolean);
    return {
      ...base,
      resources,
      unexpected,
      status: reasons.length ? 'warning' : 'ok',
      reason: reasons.join(' ') || 'Требования к технике выполнены в пределах этого снимка.',
    };
  });
}
