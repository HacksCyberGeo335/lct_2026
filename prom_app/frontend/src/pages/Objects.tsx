import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useApp, useFilters, useObjects, objectUrl } from '../app/context';
import { statusNames, type Project } from '../domain/models';
import { QueryState, Empty, StatusStamp } from '../shared/ui';
import { transition } from '../shared/motion';
import { ApiWorkspace } from './ApiWorkspace';
export function filterProjects(items: Project[], search: string, status: string, sort: string) {
  return items
    .filter(
      (p) =>
        (p.name + ' ' + p.district + ' ' + p.permit)
          .toLocaleLowerCase('ru-RU')
          .includes(search.toLocaleLowerCase('ru-RU').trim()) &&
        (!status || status === 'all' || p.status === status),
    )
    .sort((a, b) =>
      sort === 'risk'
        ? Number(b.status === 'warn') - Number(a.status === 'warn') || a.number - b.number
        : sort === 'progress'
          ? b.progress - a.progress || a.number - b.number
          : a.number - b.number,
    );
}
export function Objects() {
  const { mode } = useApp(),
    query = useObjects(),
    { params, update } = useFilters(),
    reduce = useReducedMotion();
  if (mode === 'api') return <ApiWorkspace />;
  if (!query.data)
    return <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  const all = query.data,
    rows = filterProjects(
      all,
      params.get('q') ?? '',
      params.get('status') ?? 'all',
      params.get('sort') ?? 'number',
    );
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Мониторинг строительства / реестр</p>
        <h1 className="h-page">Ведомость объектов</h1>
        <p className="meta">Срез 25.08.2026 · 14:20, UTC+3. Модельный пример, данные архивные.</p>
      </header>
      <div className="tally-strip">
        {[
          ['Объектов на контроле', all.length],
          ['Доступных камер', all.flatMap((p) => p.cameras).filter((c) => c.available).length],
          ['С риском срыва', all.filter((p) => p.status === 'warn').length],
          ['Не начато', all.filter((p) => p.status === 'idle').length],
        ].map(([label, value]) => (
          <div className="tally-cell" key={label}>
            <p className="eyebrow">{label}</p>
            <p className="v">{value}</p>
          </div>
        ))}
      </div>
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Поиск по ведомости объектов</span>
          <input
            type="search"
            placeholder="Название, округ или номер разрешения"
            value={params.get('q') ?? ''}
            onChange={(e) => update({ q: e.target.value }, true)}
          />
        </label>
        <div className="tags" aria-label="Фильтр по статусу">
          {[['all', 'Все'], ...Object.entries(statusNames)].map(([key, label]) => (
            <button
              className="tag"
              key={key}
              aria-pressed={(params.get('status') ?? 'all') === key}
              onClick={() => update({ status: key })}
            >
              {label} ({key === 'all' ? all.length : all.filter((p) => p.status === key).length})
            </button>
          ))}
        </div>
        <label className="sortwrap">
          Порядок
          <select value={params.get('sort') ?? 'number'} onChange={(e) => update({ sort: e.target.value })}>
            <option value="number">по номеру</option>
            <option value="risk">сначала проблемные</option>
            <option value="progress">по готовности</option>
          </select>
        </label>
      </div>
      <div className="registry">
        <div className="reg-head" aria-hidden="true">
          <span>№</span>
          <span>Объект</span>
          <span>Этап</span>
          <span>Готовность*</span>
          <span>Статус</span>
          <span />
        </div>
        {rows.map((p) => (
          <motion.div key={p.id} layout={reduce ? false : 'position'} transition={transition(reduce)}>
            <Link
              className="reg-row"
              to={objectUrl(p.id, '', params)}
              aria-label={p.number.toString().padStart(2, '0') + ' ' + p.name}
            >
              <span className="reg-idx">{p.number.toString().padStart(2, '0')}</span>
              <span className="reg-name-wrap">
                <span className="reg-name">{p.name}</span>
                <span className="reg-meta">{p.district}</span>
                <span className="reg-permit">{p.permit}</span>
              </span>
              <span className="reg-stage">
                {p.stage}
                <span className="reg-cams">
                  {p.cameras.length ? 'Камер: ' + p.cameras.length : 'Камеры не подключены'}
                </span>
              </span>
              <span className="reg-rail">
                <span className="reg-track">
                  <span
                    className="f"
                    style={{
                      width: p.progress + '%',
                      background: p.status === 'warn' ? 'var(--warn)' : 'var(--ok)',
                    }}
                  />
                </span>
                <span className="reg-pct">{p.progress}%</span>
              </span>
              <span className="reg-status">
                <StatusStamp status={p.status} />
              </span>
              <span className="reg-go" aria-hidden="true">
                →
              </span>
            </Link>
          </motion.div>
        ))}
        {!rows.length && (
          <Empty
            title="Ничего не найдено"
            action={
              <button className="btn btn-quiet" onClick={() => update({ q: null, status: null, sort: null })}>
                Сбросить фильтры
              </button>
            }
          >
            Попробуйте другой запрос или статус.
          </Empty>
        )}
      </div>
      <p className="sub">
        Показано {rows.length} из {all.length}. Сводка сверху — по всему реестру. *Готовность — отдельный
        модельный показатель, не расчёт по количеству техники.
      </p>
    </>
  );
}
