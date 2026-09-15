import Papa from 'papaparse';
import { dateSchema, equipmentClass, type Stage } from '../../domain/models';
import { validatePlan } from '../../domain/plan';
export const columns = {
  name: 'Название этапа',
  start: 'Начало',
  end: 'Окончание',
  id: 'ID',
  zone: 'Зона',
  equipment: 'Класс техники',
  quantity: 'Количество',
  resources: 'Ресурсы',
  parent_id: 'ID родителя',
  policy: 'Правило',
};
export type Mapping = Record<keyof typeof columns, string>;
export interface CsvInput {
  headers: string[];
  rows: string[][];
  lineNumbers: number[];
  headerLine: number;
  error: string | null;
}
export interface CsvPreview {
  stages: Stage[];
  errors: { row: number; message: string }[];
}
export function parseCsv(text: string): CsvInput {
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [],
    lineNumbers: number[] = [];
  let cursor = 0,
    line = 1,
    structureError: string | null = null;
  Papa.parse<string[]>(source, {
    step: (result) => {
      const firstLine = line;
      line += (source.slice(cursor, result.meta.cursor).match(/\r\n|\r|\n/g) ?? []).length;
      cursor = result.meta.cursor;
      if (result.errors.length && !structureError)
        structureError = 'Ошибка структуры CSV: ' + result.errors[0].message;
      if (result.data.every((cell) => !cell.trim())) return;
      records.push(result.data);
      lineNumbers.push(firstLine);
    },
  });
  const [rawHeaders = [], ...rows] = records;
  const headers = rawHeaders.map((value) => value.trim());
  const headerLine = lineNumbers.shift() ?? 1;
  return {
    headers,
    rows,
    lineNumbers,
    headerLine,
    error:
      structureError ??
      (headers.length < 3
        ? 'Нужно не менее трёх колонок.'
        : headers.some((header) => !header)
          ? 'Названия колонок не должны быть пустыми.'
          : new Set(headers).size !== headers.length
            ? 'Названия колонок дублируются.'
            : rows.length > 2000
              ? 'Лимит импорта — 2000 этапов.'
              : null),
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
  if (input.error) return { stages, errors: [{ row: input.headerLine, message: input.error }] };
  if (!mapping.name || !mapping.start || !mapping.end)
    return {
      stages,
      errors: [{ row: input.headerLine, message: 'Сопоставьте название, начало и окончание.' }],
    };
  const mapped = Object.values(mapping).filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    return {
      stages,
      errors: [{ row: input.headerLine, message: 'Одна колонка сопоставлена нескольким полям.' }],
    };
  if (mapped.some((name) => !input.headers.includes(name)))
    return { stages, errors: [{ row: input.headerLine, message: 'Выбранная колонка отсутствует в файле.' }] };
  input.rows.forEach((row, i) => {
    const get = (key: keyof Mapping) => (row[input.headers.indexOf(mapping[key])] ?? '').trim();
    const name = get('name'),
      start = get('start'),
      end = get('end'),
      id = get('id') || 'import-' + (i + 1),
      qty = get('quantity'),
      cls = get('equipment');
    const resourceText = get('resources');
    const resources: NonNullable<Stage['resources']> = [];
    const policy = get('policy') || 'required-and-unexpected';
    const messages: string[] = [];
    if (row.length !== input.headers.length) messages.push('Число полей не совпадает с заголовком');
    if (!name) messages.push('Название обязательно');
    if (!dateSchema.safeParse(start).success || !dateSchema.safeParse(end).success)
      messages.push('Даты: ГГГГ-ММ-ДД, например 2026-09-01');
    else if (start > end) messages.push('Начало позже окончания');
    if (qty && (!/^\d+$/.test(qty) || !Number.isSafeInteger(Number(qty))))
      messages.push('Количество — целое неотрицательное число');
    if (cls && !equipmentClass.safeParse(cls).success) messages.push('Неизвестный класс техники: ' + cls);
    if (resourceText && (cls || qty))
      messages.push('Используйте Ресурсы либо Класс техники / Количество, не оба формата.');
    if (!['required-only', 'required-and-unexpected'].includes(policy))
      messages.push('Правило: required-only или required-and-unexpected');
    if (resourceText) {
      for (const token of resourceText.split('|')) {
        const [equipment, amount, extra] = token
          .trim()
          .split(':')
          .map((s) => s.trim());
        const known = equipmentClass.safeParse(equipment);
        if (
          !known.success ||
          !/^[1-9]\d*$/.test(amount ?? '') ||
          Number(amount) > 1000000 ||
          extra !== undefined
        ) {
          messages.push('Ресурсы: класс:количество через |, например exc:1|dump:2');
          break;
        }
        resources.push({ equipment: known.data, quantity: Number(amount) });
      }
    } else if (
      equipmentClass.safeParse(cls).success &&
      qty &&
      Number(qty) > 0 &&
      Number.isSafeInteger(Number(qty)) &&
      Number(qty) <= 1000000
    ) {
      resources.push({ equipment: equipmentClass.parse(cls), quantity: Number(qty) });
    }
    if (qty && Number(qty) > 1000000) messages.push('Количество не более 1000000');
    if (new Set(resources.map((r) => r.equipment)).size !== resources.length)
      messages.push('Класс техники повторяется в ресурсах');
    if (qty && !cls) messages.push('Для количества укажите класс техники');
    const signature = JSON.stringify([name.toLowerCase(), start, end, get('zone').toLowerCase()]);
    if (ids.has(id) || signatures.has(signature)) messages.push('Дублирующийся ID или этап');
    ids.add(id);
    signatures.add(signature);
    if (messages.length) errors.push({ row: input.lineNumbers[i], message: messages.join('; ') });
    else
      stages.push({
        id,
        name,
        start,
        end,
        zone: get('zone'),
        parentId: get('parent_id') || null,
        resources,
        rulePolicy: policy as Stage['rulePolicy'],
        equipment: cls ? equipmentClass.parse(cls) : null,
        quantity: qty ? Number(qty) : null,
        actualStart: null,
        actualEnd: null,
        plan: null,
        fact: null,
      });
  });
  if (!errors.length) {
    for (const issue of validatePlan(stages)) {
      const index = stages.findIndex((s) => s.id === issue.id);
      errors.push({ row: input.lineNumbers[Math.max(0, index)] ?? input.headerLine, message: issue.message });
    }
  }
  if (!input.rows.length) errors.push({ row: 2, message: 'Нет строк с этапами' });
  return { stages, errors };
}
export const template =
  '\uFEFFid,parent_id,name,start,end,zone,resources,policy\r\nstage-1,,Земляные работы,2026-09-01,2026-09-30,А,exc:1|dump:2,required-and-unexpected\r\nstage-2,,Устройство фундамента,2026-09-15,2026-10-20,Б,mixer:3|crane:1,required-only\r\n';
export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'stroykontrol-plan-UTF8.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
