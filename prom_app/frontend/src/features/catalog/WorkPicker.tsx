import { useMemo, useState } from 'react';
import { requirementStatuses, type Catalog } from '../../domain/catalog';
export function WorkPicker({
  catalog,
  selected,
  onSelect,
}: {
  catalog: Catalog;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [objectType, setObjectType] = useState(''),
    [visibleOnly, setVisibleOnly] = useState(false),
    [status, setStatus] = useState('');
  const results = useMemo(
    () =>
      catalog.cards.filter(
        (c) =>
          (!query.trim() ||
            [c.canonical_work_name, c.work_name, c.id, ...c.source.context]
              .join(' ')
              .toLocaleLowerCase('ru')
              .includes(query.trim().toLocaleLowerCase('ru'))) &&
          (!category || c.macro_stage === category) &&
          (!objectType || c.applicable_object_types.includes(objectType)) &&
          (!status || catalog.works.get(c.id)?.requirement_status === status) &&
          (!visibleOnly || c.external_camera_observability >= 0.75),
      ),
    [catalog, query, category, objectType, visibleOnly, status],
  );
  const types = [...new Set(catalog.cards.flatMap((c) => c.applicable_object_types))];
  return (
    <details className="catalog-picker" open={!selected}>
      <summary>Выбрать работу из справочника · {catalog.cards.length}</summary>
      <label className="field">
        Поиск работы
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название, work_047 или контекст"
        />
      </label>
      <div className="catalog-grid">
        <label className="field">
          Категория
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Все категории</option>
            {Object.entries(catalog.categories).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Отмеченный тип объекта
          <select value={objectType} onChange={(e) => setObjectType(e.target.value)}>
            <option value="">Все типы</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Статус требований
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(requirementStatuses).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={visibleOnly} onChange={(e) => setVisibleOnly(e.target.checked)} />
        Наблюдаемость от 0,75 — экспертная оценка
      </label>
      <p className="sub">
        Найдено: {results.length}. Отсутствие отметки типа объекта не означает запрет применения.
      </p>
      <div className="catalog-results" role="group" aria-label="Работы справочника">
        {results.map((c) => (
          <button type="button" key={c.id} aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>
            <strong>{c.canonical_work_name}</strong>
            <small>
              {c.id} · {c.row_kind === 'AGGREGATE' ? 'Сводный раздел' : 'Работа'} ·{' '}
              {c.source.context.join(' / ')}
            </small>
          </button>
        ))}
        {!results.length && <p>Работ по этим условиям нет. Измените поиск или фильтры.</p>}
      </div>
    </details>
  );
}
