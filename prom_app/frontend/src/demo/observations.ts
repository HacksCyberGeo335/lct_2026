import type { Detection, ProcessingState } from '../domain/models';
export const scenarios: { value: ProcessingState; label: string }[] = [
  { value: 'succeeded', label: 'Результат готов' },
  { value: 'waiting', label: 'Ожидает обработки' },
  { value: 'running', label: 'Обрабатывается' },
  { value: 'failed', label: 'Ошибка анализа' },
  { value: 'empty', label: 'Техника не обнаружена' },
];
export function positionAt(d: Detection, time: number) {
  const step = Math.floor(Math.max(0, time - d.from) / 5);
  return { ...d, x: d.x + (d.cls === 'crane' ? 0 : Math.min(step, 6) * 0.003) };
}
export function detectionsAt(boxes: Detection[], time: number) {
  return boxes.filter((d) => d.from <= time && d.to > time).map((d) => positionAt(d, time));
}
