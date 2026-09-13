import Papa from 'papaparse';
import { dateSchema, equipmentClass, type Stage } from '../../domain/models';
export const columns = {
  name: 'Название этапа',
  start: 'Начало',
  end: 'Окончание',
  id: 'ID',
  zone: 'Зона',
  equipment: 'Класс техники',
  quantity: 'Количество',
};
export type Mapping = Record<keyof typeof columns, string>;
export interface CsvInput {
  headers: string[];
  rows: string[][];
  error: string | null;
}
export interface CsvPreview {
  stages: Stage[];
  errors: { row: number; message: string }[];
}
export function parseCsv(text: string): CsvInput {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  const [headers = [], ...rows] = result.data;
  return {
    headers: headers.map((s) => s.trim()),
    rows,
    error: result.errors.length
      ? 'Ошибка структуры CSV: ' + result.errors[0].message
      : headers.length < 3
        ? 'Нужно не менее трёх колонок.'
        : new Set(headers).size !== headers.length
          ? 'Названия колонок дублируются.'
          : rows.length > 2000
            ? 'Лимит импорта — 2000 этапов.'
            : null,
  };
}
export function defaultMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    Object.entries(columns).map(([key, label]) => [
      key,
      headers.find((h) => h.toLowerCase() === key || h.toLowerCase() === label.toLowerCase()) ?? '',
    ]),
  ) as Mapping;
}
export function validateRows(input: CsvInput, mapping: Mapping): CsvPreview {
  const errors: CsvPreview['errors'] = [],
    stages: Stage[] = [],
    ids = new Set<string>(),
    signatures = new Set<string>();
  if (input.error) return { stages, errors: [{ row: 1, message: input.error }] };
  if (!mapping.name || !mapping.start || !mapping.end)
    return { stages, errors: [{ row: 1, message: 'Сопоставьте название, начало и окончание.' }] };
  const mapped = Object.values(mapping).filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    return { stages, errors: [{ row: 1, message: 'Одна колонка сопоставлена нескольким полям.' }] };
  input.rows.forEach((row, i) => {
    const get = (key: keyof Mapping) => (row[input.headers.indexOf(mapping[key])] ?? '').trim();
    const name = get('name'),
      start = get('start'),
      end = get('end'),
      id = get('id') || 'import-' + (i + 1),
      qty = get('quantity'),
      cls = get('equipment');
    const messages: string[] = [];
    if (row.length !== input.headers.length) messages.push('Число полей не совпадает с заголовком');
    if (!name) messages.push('Название обязательно');
    if (!dateSchema.safeParse(start).success || !dateSchema.safeParse(end).success)
      messages.push('Даты: ГГГГ-ММ-ДД, например 2026-09-01');
    else if (start > end) messages.push('Начало позже окончания');
    if (qty && (!/^\d+$/.test(qty) || !Number.isSafeInteger(Number(qty))))
      messages.push('Количество — целое неотрицательное число');
    if (cls && !equipmentClass.safeParse(cls).success) messages.push('Класс: exc, dump, crane или mixer');
    if (qty && !cls) messages.push('Для количества укажите класс техники');
    const signature = [name.toLowerCase(), start, end, get('zone').toLowerCase()].join('|');
    if (ids.has(id) || signatures.has(signature)) messages.push('Дублирующийся ID или этап');
    ids.add(id);
    signatures.add(signature);
    if (messages.length) errors.push({ row: i + 2, message: messages.join('; ') });
    else
      stages.push({
        id,
        name,
        start,
        end,
        zone: get('zone'),
        equipment: cls ? equipmentClass.parse(cls) : null,
        quantity: qty ? Number(qty) : null,
        actualStart: null,
        actualEnd: null,
        plan: null,
        fact: null,
      });
  });
  if (!input.rows.length) errors.push({ row: 2, message: 'Нет строк с этапами' });
  return { stages, errors };
}
export const template =
  '\uFEFFid,name,start,end,zone,equipment,quantity\r\nstage-1,Земляные работы,2026-09-01,2026-09-30,А,exc,2\r\nstage-2,Устройство фундамента,2026-09-15,2026-10-20,Б,mixer,3\r\n';
export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'stroykontrol-plan-UTF8.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
