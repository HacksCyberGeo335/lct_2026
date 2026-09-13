import { useState } from 'react';
import { day, isoDay, formatDate, SNAPSHOT, type Project, type Stage, stageStatus } from '../domain/models';
import { ObjectHeader } from '../shared/ObjectHeader';
import { Legend, Empty } from '../shared/ui';
import { ImportPlan } from '../features/import/ImportPlan';
import { DeviationDialog } from '../features/report/DeviationDialog';
export function Schedule({ project }: { project: Project }) {
  const [detail, setDetail] = useState<Stage | null>(null),
    [scale, setScale] = useState(1);
  const from = Math.min(day(SNAPSHOT), ...project.stages.map((s) => day(s.start))),
    to = Math.max(day(SNAPSHOT), ...project.stages.map((s) => day(s.end))) + 7,
    span = Math.max(1, to - from);
  const position = (date: string) => ((day(date) - from) / span) * 100;
  return (
    <>
      <ObjectHeader project={project} title="Календарный график">
        <ImportPlan objectId={project.id} />
      </ObjectHeader>
      <section className="sheet sheet-pad">
        <div className="section-heading">
          <h2 className="h-sec">План и наблюдённый факт по этапам</h2>
          <Legend />
        </div>
        <div className="toolbar">
          <p className="sub">Срез 25.08.2026. Сплошная полоса заканчивается на последней наблюдённой дате.</p>
          <label className="field compact">
            Масштаб
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              <option value="1">Весь период</option>
              <option value="2">Подробно ×2</option>
              <option value="3">Подробно ×3</option>
            </select>
          </label>
        </div>
        {project.stages.length ? (
          <div className="gantt-scroll" tabIndex={0} aria-label="Прокручиваемый календарный график">
            <div className="gantt-table" style={{ minWidth: Math.max(840, scale * 840) }}>
              <div className="gantt-date-row">
                <span className="eyebrow">Этап / зона работ</span>
                <div className="gantt-date-axis">
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i} style={{ left: (i / 6) * 100 + '%' }}>
                      {formatDate(isoDay(from + Math.round((span * i) / 6))).slice(0, 5)}
                    </span>
                  ))}
                </div>
              </div>
              {project.stages.map((s) => (
                <button
                  className="gantt-row"
                  key={s.id}
                  onClick={() => setDetail(s)}
                  aria-label={'Подробности: ' + s.name}
                >
                  <span className="gantt-name">
                    {s.name}
                    <small>{s.zone || 'Зона не задана'}</small>
                  </span>
                  <span className="gantt-lane">
                    <i
                      className="gantt-plan"
                      style={{
                        left: position(s.start) + '%',
                        width: ((day(s.end) - day(s.start) + 1) / span) * 100 + '%',
                      }}
                    />
                    {s.actualStart && (
                      <i
                        className={'gantt-fact ' + stageStatus(s)}
                        style={{
                          left: position(s.actualStart) + '%',
                          width:
                            ((Math.min(day(s.actualEnd ?? SNAPSHOT), day(SNAPSHOT)) -
                              day(s.actualStart) +
                              1) /
                              span) *
                              100 +
                            '%',
                        }}
                      />
                    )}
                    <i className="cutoff" style={{ left: position(SNAPSHOT) + '%' }} />
                  </span>
                </button>
              ))}
              <div className="gantt-date-row">
                <span />
                <span className="gantt-date-axis">
                  <span className="cutoff-label" style={{ left: position(SNAPSHOT) + '%' }}>
                    25 АВГ · СРЕЗ
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Empty title="План пока пуст">Импортируйте этапы из CSV.</Empty>
        )}
        <p className="sub">
          Выберите этап, чтобы увидеть даты, ожидаемую технику и основания. Импортированные этапы не получают
          выдуманный факт.
        </p>
      </section>
      <DeviationDialog project={project} stage={detail} onClose={() => setDetail(null)} />
    </>
  );
}
