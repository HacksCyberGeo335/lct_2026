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
          Видео можно загрузить на сервер. Анализ и мониторинг ожидают подключения серверных функций.
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
          <h2 className="h-sec">Загруженные в этом сеансе записи</h2>
          <label className="field">
            Запись
            <select value={recording.id} onChange={(e) => setSelected(e.target.value)}>
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {recording.url ? (
            <StoredVideo key={recording.id} url={recording.url} />
          ) : (
            <p>Видео загружено. Сервер не предоставил отдельный адрес для просмотра.</p>
          )}
          <p className="mono small-text">UUID: {recording.id}</p>
          <p>READY: видео загружено; анализ пока недоступен.</p>
          <p className="sub">
            Если видео не воспроизводится, проверьте доступность публичного URL и кодек. Список существует
            только в текущем сеансе: серверный GET списка пока отсутствует.
          </p>
        </section>
      ) : (
        <section className="sheet">
          <Empty title="В этом сеансе нет загруженных записей">
            Загрузите видео кнопкой «Загрузить запись». Список записей с сервера пока недоступен.
            {demoAvailable && ' Демонстрационный сценарий можно открыть в верхней панели.'}
          </Empty>
        </section>
      )}
    </>
  );
}

function StoredVideo({ url }: { url: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <video
        key={attempt}
        controls
        preload="metadata"
        className="api-video"
        src={url}
        onLoadedMetadata={() => setState('ready')}
        onError={() => setState('error')}
      />
      {state === 'loading' && <p role="status">Открываем видео из хранилища…</p>}
      {state === 'error' && (
        <div className="stack">
          <p role="alert">
            Не удалось воспроизвести видео. Проверьте доступность хранилища и поддержку кодека. Подтверждённая
            загрузка сохранена.
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
