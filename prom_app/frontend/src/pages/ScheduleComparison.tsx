import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProject } from '../app/context';
import { Empty, QueryState } from '../shared/ui';
export function ScheduleComparison() {
  const query = useProject();
  const [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const route = '/objects/' + encodeURIComponent(query.objectId || 'unavailable');
  const invalid = !!(start && end && start > end);
  const stages =
    query.project?.stages.filter((s) => (!start || s.end >= start) && (!end || s.start <= end)) ?? [];
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">План и наблюдения</p>
        <h1 className="h-page">Соответствие графику</h1>
        <p className="meta">{query.project?.name ?? 'Выберите объект после подключения реестра'}</p>
      </header>
      <section className="sheet sheet-pad stack">
        <div className="actions">
          <label className="field">
            Период с<input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            По
            <input type="date" value={end} aria-invalid={invalid} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {invalid && <p role="alert">Окончание периода должно быть не раньше начала.</p>}
        <QueryState pending={query.isFetching} error={query.error} retry={() => void query.refetch()} />
        {!invalid &&
          (stages.length ? (
            <div className="table-scroll">
              <table className="project-stage-table">
                <caption>Плановые этапы за выбранный период</caption>
                <thead>
                  <tr>
                    <th>Этап</th>
                    <th>Сроки</th>
                    <th>Наблюдения</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        {s.start} — {s.end}
                      </td>
                      <td>Результаты анализа не получены</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={query.project ? 'За этот период нет этапов' : 'График пока недоступен'}>
              Добавьте график объекта, чтобы сопоставлять этапы с наблюдениями.
            </Empty>
          ))}
        <p className="sub">
          Отклонения и фактический прогресс появятся после подключения анализа. Отсутствие наблюдений не
          означает отставание.
        </p>
        <div className="actions">
          <Link className="btn btn-primary" to={route + '/schedule'}>
            Открыть график работ
          </Link>
          <Link className="btn btn-quiet" to={route + '/inspection'}>
            Проверить снимки
          </Link>
        </div>
      </section>
    </>
  );
}
