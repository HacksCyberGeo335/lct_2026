import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useApp } from '../app/context';
import { request } from '../api/videoApi';
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
      const response = await request(apiBase.replace(/\/api$/, ''), '/health', {}, signal, 8000);
      return z.object({ status: z.literal('ok') }).parse(await response.json());
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
        <p className="meta">Загрузка видео подключена к действующему Gateway.</p>
      </header>
      <section className="sheet sheet-pad stack">
        <div className="section-heading">
          <h2 className="h-sec">Подключение и загрузка</h2>
          <Upload onSelected={setSelected} />
        </div>
        {health.data ? (
          <p role="status" className="connection-ok">
            Gateway доступен · /health
          </p>
        ) : (
          <QueryState pending={health.isPending} error={health.error} retry={() => void health.refetch()} />
        )}
        <p className="sub">
          Реестр объектов, камеры, обработка, аналитика, календарные планы и настройки ещё не имеют API.
          Реальные видео не связываются с демонстрационной аналитикой.
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
          <video controls preload="metadata" className="api-video" src={recording.url ?? undefined} />
          <p>READY: видео загружено; анализ пока недоступен.</p>
          <p className="sub">
            Если видео не воспроизводится, проверьте доступность публичного URL и кодек. Список существует
            только в текущем сеансе: серверный GET списка пока отсутствует.
          </p>
        </section>
      ) : (
        <section className="sheet">
          <Empty title="Данные раздела пока недоступны">
            Загрузите запись или явно выберите демонстрационный режим в верхней панели.
          </Empty>
        </section>
      )}
    </>
  );
}
