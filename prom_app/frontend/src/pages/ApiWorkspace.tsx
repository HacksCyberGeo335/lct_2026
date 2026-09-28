import { demoAvailable } from '../app/demoExtension';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useApp } from '../app/context';
import { request, readJson } from '../api/http';
import { Upload } from '../features/upload/Upload';
import { ImportPlan } from '../features/import/ImportPlan';
import { Empty, QueryState } from '../shared/ui';
import { useState } from 'react';
export function ApiWorkspace({ section = 'objects' }: { section?: string }) {
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
  const titles: Record<string, string> = {
    objects: 'Ведомость объектов',
    site: 'Площадка',
    analytics: 'Соответствие графику',
    schedule: 'График работ',
    settings: 'Настройки мониторинга',
  };
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Рабочее подключение / API</p>
        <h1 className="h-page">{titles[section] ?? titles.objects}</h1>
        <p className="meta">
          Фото и видео можно загрузить на сервер. Анализ и мониторинг ожидают подключения серверных функций.
        </p>
        <Link className="btn btn-primary" to="/objects/unavailable/inspection?mode=api">
          Открыть проверку снимков →
        </Link>
      </header>
      <section className="sheet sheet-pad stack">
        <div className="section-heading">
          <h2 className="h-sec">Подключение и загрузка</h2>
          <Upload onSelected={setSelected} />
        </div>
        {health.error ? (
          <QueryState error={health.error} />
        ) : health.data ? (
          <p role="status" className="connection-ok">
            Gateway доступен · /health
          </p>
        ) : (
          <QueryState pending={health.isPending} />
        )}
        <button className="btn btn-quiet" disabled={health.isFetching} onClick={() => void health.refetch()}>
          {health.isFetching ? 'Проверяем подключение…' : 'Проверить подключение'}
        </button>
        <p className="sub">
          Ответ Gateway подтверждает только его доступность. Состояние базы и хранилища проверяется при
          загрузке файла.
        </p>
        <p className="sub">
          Реестр объектов, камеры, обработка, аналитика, календарные планы и настройки ещё не имеют API. После
          загрузки результат анализа автоматически не создаётся.
        </p>
        {section === 'schedule' && <ImportPlan objectId="unavailable" />}
        {section === 'settings' && (
          <p>Оповещения и список сотрудников недоступны. Серверное сохранение настроек не реализовано.</p>
        )}
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
          <p className="mono small-text">UUID: {recording.id}</p>
          <p>READY: файл загружен; анализ пока недоступен.</p>
          <p className="sub">
            Если файл не открывается, проверьте доступность хранилища и поддержку формата браузером. Список
            существует только в текущем сеансе: серверный GET списка пока отсутствует.
          </p>
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

function StoredMedia({ url, image, name }: { url: string; image: boolean; name: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      {image ? (
        <img
          key={attempt}
          className="api-image"
          src={url}
          alt={name}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      ) : (
        <video
          key={attempt}
          controls
          preload="metadata"
          className="api-video"
          src={url}
          onLoadedMetadata={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
      <a className="btn btn-quiet" href={url} target="_blank" rel="noopener noreferrer">
        Открыть оригинал
      </a>
      {state === 'loading' && <p role="status">Открываем файл из хранилища…</p>}
      {state === 'error' && (
        <div className="stack">
          <p role="alert">
            {image ? 'Не удалось показать фото.' : 'Не удалось воспроизвести видео.'} Проверьте доступность
            хранилища и поддержку формата. Подтверждённая загрузка сохранена.
          </p>
          <button
            className="btn btn-quiet"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Повторить просмотр
          </button>
        </div>
      )}
    </>
  );
}
