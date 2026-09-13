import { describe, it, expect } from 'vitest';
import { parseCsv, defaultMapping, validateRows, template } from './csv';
const validate = (text: string) => {
  const parsed = parseCsv(text);
  return validateRows(parsed, defaultMapping(parsed.headers));
};
describe('CSV boundary', () => {
  it('validates normalized header names and missing column selections', () => {
    expect(validate(' name ,name,start,end\nA,B,2026-01-01,2026-02-01').errors[0].message).toContain(
      'дублируются',
    );
    expect(validate('name,start,end,\nA,2026-01-01,2026-02-01,x').errors[0].message).toContain('пустыми');
    const input = parseCsv(template),
      mapping = defaultMapping(input.headers);
    mapping.zone = 'missing';
    expect(validateRows(input, mapping).errors[0].message).toContain('отсутствует');
  });
  it('reports physical CSV line numbers after blanks and quoted multiline cells', () => {
    const input = parseCsv(
      '\nname,start,end\n"Фундамент\nзона А",2026-01-01,2026-02-01\n\nОшибка,2026-02-30,2026-03-01',
    );
    expect(input.lineNumbers).toEqual([3, 6]);
    const result = validateRows(input, defaultMapping(input.headers));
    expect(result.stages[0].name).toBe('Фундамент\nзона А');
    expect(result.errors[0].row).toBe(6);
  });
  it('accepts template and overlapping stages without inventing observations', () => {
    const p = validate(template);
    expect(p.errors).toEqual([]);
    expect(p.stages).toHaveLength(2);
    expect(p.stages[0].fact).toBeNull();
    expect(p.stages[0].actualStart).toBeNull();
  });
  it('accepts quoted Cyrillic fields, semicolons and BOM', () => {
    const p = validate('\uFEFFname;start;end\n"Кран; зона А";2026-01-01;2026-02-01');
    expect(p.errors).toEqual([]);
    expect(p.stages[0].name).toBe('Кран; зона А');
  });
  it('validates actual calendar dates, ordering and quantities with row numbers', () => {
    const p = validate(
      'name,start,end,equipment,quantity\nЭтап,2026-02-30,2026-03-01,crane,-1\nДругой,2026-04-01,2026-03-01,plane,2',
    );
    expect(p.errors).toHaveLength(2);
    expect(p.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(p.stages).toHaveLength(0);
  });
  it('rejects duplicate stages, missing required columns, empty files, repeated mappings', () => {
    expect(validate('name,start,end\nA,2026-01-01,2026-02-01\nA,2026-01-01,2026-02-01').errors[0].row).toBe(
      3,
    );
    expect(validate('foo,bar,baz\n1,2,3').errors[0].message).toContain('Сопоставьте');
    expect(validate('').errors.length).toBeGreaterThan(0);
    const input = parseCsv(template),
      mapping = defaultMapping(input.headers);
    mapping.end = mapping.start;
    expect(validateRows(input, mapping).errors[0].message).toContain('нескольким');
  });
});
