import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp, useFilters } from '../app/context';
import { source } from '../api/source';
import {
  deltaText,
  formatDate,
  formatNumber,
  stageStatus,
  SNAPSHOT,
  day,
  isoDay,
  type Project,
  type Stage,
} from '../domain/models';
import { ObjectHeader } from '../shared/ObjectHeader';
import { QueryState, StatusStamp, Empty } from '../shared/ui';
import { ReportChart } from '../features/report/ReportChart';
import { DeviationDialog } from '../features/report/DeviationDialog';
export function Analytics({ project }: { project: Project }) {
  const { mode } = useApp(),
    { params, update } = useFilters(),
    [detail, setDetail] = useState<Stage | null>(null);
  const period = [7, 14, 30].includes(Number(params.get('period'))) ? Number(params.get('period')) : 7;
  const report = useQuery({
    queryKey: [mode, 'report', project.id, period],
    queryFn: ({ signal }) => source(mode).report(project.id, period, signal),
    retry: false,
  });
  if (!report.data)
    return <QueryState pending={report.isPending} error={report.error} retry={() => void report.refetch()} />;
  const data = report.data;
  async function print() {
    await document.fonts.ready;
    window.print();
  }
  return (
    <article className="report">
      <ObjectHeader project={project} title="Соответствие графику">
        <button className="btn btn-quiet" onClick={() => void print()}>
          Печать / сохранить PDF
        </button>
      </ObjectHeader>
      <div className="report-period">
        <p>
          Объект: <b>{project.name}</b>
          <br />
          Период: {formatDate(isoDay(day(SNAPSHOT) - period + 1))} — {formatDate(SNAPSHOT)} · обновлено
          25.08.2026, 14:20 UTC+3
        </p>
        <label className="field compact no-print">
          Период отчёта
          <select value={period} onChange={(e) => update({ period: e.target.value })}>
            <option value="7">7 дней</option>
            <option value="14">14 дней</option>
            <option value="30">30 дней</option>
          </select>
        </label>
      </div>
      <p className="report-mark">
        Демонстрационные данные · модельный пример. Сформировано:{' '}
        {new Date(data.generatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}, UTC+3.
      </p>
      <div className="kpi-band">
        {[
          [
            'Соответствие графику',
            data.compliance === null ? '—' : formatNumber(data.compliance) + '%',
            'Факт / план с весами по длительности',
          ],
          [
            'Отклонение прогресса',
            data.plan ? deltaText(data.delta) : 'Нет расчёта',
            'Факт минус план на дату среза',
          ],
          ['Текущий этап', project.stage, 'Модельный пример этапа'],
          [
            'Прогноз завершения',
            project.forecast ?? 'Недостаточно данных',
            'Демонстрационный сценарий, не ML-прогноз',
          ],
        ].map(([label, value, note], i) => (
          <div className="kpi" key={label}>
            <p className="eyebrow">{label}</p>
            <p className={'kpi-v' + (i > 1 ? ' small' : '')}>{value}</p>
            <p className="kpi-s">{note}</p>
          </div>
        ))}
      </div>
      <section className="sheet sheet-pad">
        <h2 className="h-sec">Выполнение плана по датам, %</h2>
        {data.points.length ? (
          <ReportChart points={data.points} />
        ) : (
          <Empty title="Нет данных для графика">
            Плановые и фактические доли выполнения ещё не рассчитаны.
          </Empty>
        )}
        <p className="chart-cap">
          Доли выполнения заданы в демонаборе. Вес этапа — его плановая длительность. Количество детекций не
          используется для расчёта готовности. Полнота наблюдений:{' '}
          {project.coverage === null ? 'нет наблюдений' : project.coverage + '%'}.
        </p>
      </section>
      <section className="sheet sheet-pad">
        <h2 className="h-sec">Этапы работ: план, факт и отклонение</h2>
        <div className="table-scroll">
          <table>
            <caption>Срез на 25.08.2026 · {project.name}</caption>
            <thead>
              <tr>
                <th>Этап работ</th>
                <th>Плановый период</th>
                <th>Факт на дату среза</th>
                <th>План / факт, %</th>
                <th>Отклонение</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {project.stages.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    <button className="table-link" onClick={() => setDetail(s)}>
                      {s.name}
                    </button>
                  </th>
                  <td>
                    {formatDate(s.start)} — {formatDate(s.end)}
                  </td>
                  <td>
                    {s.actualStart
                      ? formatDate(s.actualStart) +
                        ' — ' +
                        (s.actualEnd ? formatDate(s.actualEnd) : 'наблюдается')
                      : 'Нет наблюдённого факта'}
                  </td>
                  <td className="mono">
                    {s.plan ?? '—'} / {s.fact ?? '—'}
                  </td>
                  <td className="mono">
                    {deltaText(s.fact !== null && s.plan !== null ? s.fact - s.plan : null)}
                  </td>
                  <td>
                    <StatusStamp status={stageStatus(s)} text={s.fact === null ? 'Нет данных' : undefined} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <DeviationDialog project={project} stage={detail} onClose={() => setDetail(null)} />
    </article>
  );
}
