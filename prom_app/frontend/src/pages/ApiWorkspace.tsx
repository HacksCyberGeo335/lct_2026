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
    enabled: section !== 'schedule',
  });
  const recording = recordings.find((r) => r.id === selected) ?? recordings[recordings.length - 1];
  const titles: Record<string, string> = {
    objects: 'Ведомость объектов',
    site: 'Площадка',
    analytics: 'Соответствие графику',
    schedule: 'График работ',
    settings: 'Настройки мониторинга',
  };
  if (section === 'schedule')
    return (
      <>
        <header className="pagehead">
          <p className="eyebrow">Планирование строительства</p>
          <h1 className="h-page">График работ</h1>
          <p className="meta">Создайте график вручную или импортируйте CSV и выберите объект.</p>
        </header>
        <ObjectWorkspace view="schedule" />
      </>
    );
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
      {['objects', 'schedule'].includes(section) && <ObjectWorkspace view="objects" />}
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
