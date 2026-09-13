import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useFilters, objectUrl } from '../app/context';
import { type Project, type Recording, CAPTURED, deltaText, stageStatus } from '../domain/models';
import { ObjectHeader } from '../shared/ObjectHeader';
import { Empty, Legend } from '../shared/ui';
import { Player } from '../features/player/Player';
import { Upload } from '../features/upload/Upload';
export function Site({ project }: { project: Project }) {
  const { recordings } = useApp(),
    { params, update } = useFilters();
  const cameraId = params.get('camera') ?? project.cameras[0]?.id ?? null;
  const camera = project.cameras.find((c) => c.id === cameraId) ?? null;
  const local = recordings.filter((r) => r.objectId === project.id && r.cameraId === cameraId);
  const sample: Recording = {
    id: 'sample',
    name: 'Синтетическая запись · 25 августа',
    cameraId,
    kind: 'synthetic-video',
    url: '/media/' + project.id + '-' + cameraId + '.webm',
    capturedAt: CAPTURED,
    duration: 60,
    processing: 'succeeded',
  };
  const sourceId = params.get('recording') ?? 'sample';
  const recording =
    sourceId === 'sample'
      ? sample
      : sourceId === 'sample-stills'
        ? { ...sample, id: 'sample-stills', kind: 'synthetic' as const, url: null }
        : local.find((r) => r.id === sourceId);
  const initialTime = Math.max(0, Math.min(60, Number(params.get('t')) || 15)),
    [time, setTime] = useState(initialTime);
  useEffect(() => setTime(initialTime), [initialTime, cameraId, sourceId]);
  return (
    <>
      <ObjectHeader project={project}>
        <Upload
          key={cameraId}
          objectId={project.id}
          cameraId={cameraId}
          onSelected={(id) => update({ recording: id, t: '0' })}
        />
      </ObjectHeader>
      {project.status === 'warn' && (
        <div className="alarm">
          <div>
            <p className="alarm-t">Наблюдения указывают на риск отставания</p>
            <div className="alarm-d">
              Проверьте основания по этапам. Недостаток техники — возможная причина; процент физической
              готовности не определяется одним подсчётом машин.
            </div>
            <div className="alarm-act">
              <Link className="btn-link" to={objectUrl(project.id, 'analytics', params)}>
                Изучить отклонение →
              </Link>
              <Link className="btn-link" to={objectUrl(project.id, 'schedule', params)}>
                Открыть график
              </Link>
            </div>
          </div>
        </div>
      )}
      <div className="source-toolbar">
        <label className="field compact">
          Камера
          <select
            aria-label="Камера"
            value={cameraId ?? ''}
            disabled={!project.cameras.length}
            onChange={(e) => update({ camera: e.target.value, recording: null, t: null })}
          >
            {!project.cameras.length && <option value="">Камеры не подключены</option>}
            {project.cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.available ? '' : ' · недоступна'}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact">
          Источник
          <select value={sourceId} onChange={(e) => update({ recording: e.target.value, t: null })}>
            <option value="sample">Демовидео · 25.08.2026</option>
            <option value="sample-stills">Серия демоснимков · 25.08.2026</option>
            {local.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <span className="sub">Архив · срез 25 августа 2026</span>
      </div>
      {!recording ? (
        <section className="sheet">
          <Empty
            title="Запись недоступна"
            action={
              <button className="btn btn-quiet" onClick={() => update({ recording: null })}>
                Вернуться к снимкам
              </button>
            }
          >
            Локальные записи доступны только в текущем сеансе.
          </Empty>
        </section>
      ) : !camera && recording.kind !== 'video' ? (
        <section className="sheet">
          <Empty
            title={project.cameras.length ? 'Камера не найдена' : 'Камеры ещё не подключены'}
            action={
              project.cameras.length ? (
                <button className="btn btn-quiet" onClick={() => update({ camera: null })}>
                  Выбрать доступную камеру
                </button>
              ) : undefined
            }
          >
            Можно загрузить запись вручную. Отсутствие камер не означает отсутствие техники на объекте.
          </Empty>
        </section>
      ) : (
        <Player
          key={project.id + '-' + cameraId + '-' + sourceId}
          camera={camera}
          recording={recording}
          time={time}
          onTime={setTime}
        />
      )}
      <section className="sheet sheet-pad comparison">
        <div className="section-heading">
          <h2 className="h-sec">Сопоставление с календарным графиком</h2>
          <Link to={objectUrl(project.id, 'analytics', params)} className="btn-link">
            Открыть отчёт →
          </Link>
        </div>
        <p className="sub">
          Модельные показатели этапов на 25.08.2026. Не являются результатом анализа загруженного файла.
        </p>
        <div className="stage-bars">
          {project.stages.map((s) => (
            <div className="stage-bar-row" key={s.id}>
              <span>{s.name}</span>
              <div className="double-track">
                <i className="plan-bar" style={{ width: (s.plan ?? 0) + '%' }} />
                <i className={'fact-bar ' + stageStatus(s)} style={{ width: (s.fact ?? 0) + '%' }} />
              </div>
              <span className="mono">
                {s.fact === null ? '—' : s.fact + '%'}{' '}
                <small>{deltaText(s.fact !== null && s.plan !== null ? s.fact - s.plan : null)}</small>
              </span>
            </div>
          ))}
        </div>
        <Legend />
      </section>
    </>
  );
}
