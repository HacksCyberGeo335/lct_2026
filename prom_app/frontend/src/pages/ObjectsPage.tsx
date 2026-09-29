import { OpenInInspection } from '../features/upload/OpenInInspection';
import { demoAvailable } from '../app/demoExtension';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useApp } from '../app/context';
import { request, readJson } from '../api/http';
import { StoredMedia } from '../features/upload/StoredMedia';
import { Upload } from '../features/upload/Upload';
import { AnalysisPanel } from '../features/analysis/AnalysisPanel';
import { ObjectWorkspace } from '../features/projects/ObjectWorkspace';
import { Empty, QueryState } from '../shared/ui';
import { useState } from 'react';
export function ObjectsPage() {
  const { apiBase, recordings } = useApp(),
    [selected, setSelected] = useState('');
  const health = useQuery({
    queryKey: ['api', 'health', apiBase],
    queryFn: async ({ signal }) => {
      return request(
        apiBase.replace(/\/api$/, ''),
        '/health',
        {},
        signal,
        readJson(z.object({ status: z.literal('ok') })),
        8000,
      );
    },
    retry: false,
  });
  const recording = recordings.find((r) => r.id === selected) ?? recordings[recordings.length - 1];
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Объекты строительства</p>
        <h1 className="h-page">Ведомость объектов</h1>
        <p className="meta">Карточки строительных объектов и связанные с ними графики работ.</p>
        <Link className="btn btn-primary" to="/objects/unavailable/inspection?mode=api">
          Открыть проверку снимков →
        </Link>
      </header>
      <ObjectWorkspace view="objects" />
      <section className="sheet sheet-pad stack">
        <div className="section-heading">
          <h2 className="h-sec">Материалы площадки</h2>
          <Upload onSelected={setSelected} />
        </div>
        {health.error ? (
          <QueryState error={health.error} />
        ) : health.data ? (
          <p role="status" className="connection-ok">
            Сервис загрузки доступен
          </p>
        ) : (
          <QueryState pending={health.isPending} />
        )}
        <button className="btn btn-quiet" disabled={health.isFetching} onClick={() => void health.refetch()}>
          {health.isFetching ? 'Проверяем подключение…' : 'Проверить подключение'}
        </button>
        <details>
          <summary>О доступных возможностях</summary>
          <p className="sub">
            Доступность сервиса не подтверждает состояние хранилища. Реестр объектов, камеры и автоматический
            анализ ещё не подключены.
          </p>
        </details>
      </section>
      {recording ? (
        <section className="sheet sheet-pad stack">
          <h2 className="h-sec">Загруженные в этом сеансе файлы</h2>
          <label className="field">
            Файл
            <select aria-label="Файл" value={recording.id} onChange={(e) => setSelected(e.target.value)}>
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {recording.url ? (
            <StoredMedia
              key={recording.id}
              url={recording.url}
              image={recording.kind === 'image'}
              name={recording.name}
            />
          ) : (
            <p>Файл загружен. Сервер не предоставил отдельный адрес для просмотра.</p>
          )}
          <details>
            <summary>Технические сведения</summary>
            <p className="mono small-text">UUID: {recording.id}</p>
          </details>
          <p>Файл загружен. Анализ пока недоступен.</p>
          <p className="sub">
            Если файл не открывается, проверьте доступность хранилища и поддержку формата браузером. История
            файлов пока доступна только до перезагрузки страницы.
          </p>
          <OpenInInspection recording={recording} />
          <AnalysisPanel fileId={recording.id} fileName={recording.name} analysis={recording.analysis} />
        </section>
      ) : (
        <section className="sheet">
          <Empty title="В этом сеансе нет загруженных файлов">
            Добавьте файлы кнопкой «Загрузить фото или видео». Список файлов с сервера пока недоступен.
            {demoAvailable && ' Демонстрационный сценарий можно открыть в верхней панели.'}
          </Empty>
        </section>
      )}
    </>
  );
}
