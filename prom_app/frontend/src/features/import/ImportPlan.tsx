import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../app/context';
import { source } from '../../api/source';
import { Modal, Notice } from '../../shared/ui';
import {
  columns,
  defaultMapping,
  downloadTemplate,
  parseCsv,
  validateRows,
  type CsvInput,
  type Mapping,
} from './csv';
export function ImportPlan({ objectId }: { objectId: string }) {
  const { mode } = useApp(),
    client = useQueryClient();
  const [open, setOpen] = useState(false),
    [input, setInput] = useState<CsvInput | null>(null),
    [mapping, setMapping] = useState<Mapping>(defaultMapping([])),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const version = useRef(0);
  const preview = input ? validateRows(input, mapping) : null;
  function close() {
    version.current++;
    setOpen(false);
  }
  async function read(file: File | undefined) {
    const current = ++version.current;
    setError('');
    setInput(null);
    setSuccess(false);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) {
      setError('Нужен CSV UTF-8 размером до 2 МБ.');
      return;
    }
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (current !== version.current) return;
      const result = parseCsv(text);
      setInput(result);
      setMapping(defaultMapping(result.headers));
    } catch {
      if (current === version.current) setError('Не удалось прочитать файл. Проверьте кодировку UTF-8.');
    }
  }
  async function apply() {
    if (!preview || preview.errors.length || mode === 'api' || busy) return;
    setBusy(true);
    setError('');
    try {
      await source(mode).savePlan(objectId, preview.stages);
      await client.invalidateQueries({ queryKey: [mode] });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="actions">
        <button className="btn btn-quiet" onClick={downloadTemplate}>
          Скачать шаблон CSV
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            setOpen(true);
            setSuccess(false);
          }}
        >
          Импорт плана
        </button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title="Импорт календарного плана"
        description="Проверьте колонки и строки. Текущий план изменится только после применения."
      >
        <p className="sub">
          CSV UTF-8, запятая или точка с запятой. Даты — ГГГГ-ММ-ДД. До 2000 этапов / 2 МБ. Импорт заменяет
          план выбранного объекта.
        </p>
        <label className="field">
          Файл плана
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </label>
        {input && (
          <>
            <div className="mapping">
              {Object.entries(columns).map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  {['name', 'start', 'end'].includes(key) ? ' *' : ''}
                  <select
                    aria-label={'Колонка: ' + label}
                    value={mapping[key as keyof Mapping]}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: e.target.value });
                      setSuccess(false);
                    }}
                  >
                    <option value="">Не указана</option>
                    {input.headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="table-scroll preview-table">
              <table>
                <caption>Предпросмотр: {input.rows.length} строк (первые 20)</caption>
                <thead>
                  <tr>
                    <th>Строка</th>
                    {input.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {input.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{i + 2}</td>
                      {r.map((value, j) => (
                        <td key={j}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {preview && preview.errors.length > 0 && (
          <div role="alert" className="error-text">
            <strong>Ошибок: {preview.errors.length}</strong>
            <ul>
              {preview.errors.slice(0, 30).map((e, i) => (
                <li key={i}>
                  Строка {e.row}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {mode === 'api' && (
          <Notice>Предпросмотр доступен. Сохранение плана на сервер пока не реализовано.</Notice>
        )}
        {success ? (
          <Notice>План применён локально к этому демообъекту.</Notice>
        ) : (
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={mode === 'api' || !preview || preview.errors.length > 0 || busy}
              onClick={() => void apply()}
            >
              {busy ? 'Сохранение…' : 'Применить план'}
            </button>
            <button className="btn btn-quiet" onClick={close}>
              Отмена
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
