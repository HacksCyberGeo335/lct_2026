import { analysisResultSchema, type InspectionFrame, type AnalysisResult } from '../domain/inspection';

/** Shared import boundary. A future HTTP transport can pass its JSON to this same parser. */
export function parseAnalysisResult(value: unknown, frame: InspectionFrame): AnalysisResult {
  const parsed = analysisResultSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Некорректный результат анализа: ' +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; '),
    );
  const result = parsed.data;
  if (result.image.sha256.toLowerCase() !== frame.sha256.toLowerCase() || result.image.name !== frame.name)
    throw new Error('Результат относится к другому снимку: имя или SHA-256 не совпадает.');
  if (result.image.width !== frame.width || result.image.height !== frame.height)
    throw new Error('Размеры исходного снимка не совпадают с результатом анализа.');
  return result;
}
export async function readAnalysisFile(file: File, frame: InspectionFrame) {
  if (!file.name.toLowerCase().endsWith('.json') || file.size > 4 * 1024 * 1024)
    throw new Error('Выберите JSON размером до 4 МБ.');
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()));
  } catch {
    throw new Error('Не удалось прочитать JSON UTF-8.');
  }
  return parseAnalysisResult(value, frame);
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
