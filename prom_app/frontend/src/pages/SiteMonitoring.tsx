import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useProject } from '../app/context';
import { Upload } from '../features/upload/Upload';
import { StoredMedia } from '../features/upload/StoredMedia';
import { AnalysisPanel } from '../features/analysis/AnalysisPanel';
import { Empty } from '../shared/ui';
export function SiteMonitoring() {
  const { project, objectId } = useProject();
  const { recordings } = useApp();
  const [selected, setSelected] = useState('');
  const files = recordings.filter((file) =>
    project ? file.objectId === project.id : !file.objectId || file.objectId === objectId,
  );
  const file = files.find((item) => item.id === selected) ?? files.at(-1);
  const route = '/objects/' + encodeURIComponent(project?.id ?? (objectId || 'unavailable'));
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Мониторинг строительной площадки</p>
        <h1 className="h-page">Площадка</h1>
        <p className="meta">{project?.name ?? 'Объект для мониторинга ещё не подключён'}</p>
        <div className="actions">
          <Upload objectId={project?.id ?? ''} onSelected={setSelected} />
          <Link className="btn btn-quiet" to={route + '/inspection?mode=api'}>
            Проверить снимки
          </Link>
        </div>
      </header>
      <div className="source-toolbar">
        <label className="field compact">
          Камера
          <select disabled aria-label="Камера">
            <option>Камеры не подключены</option>
          </select>
        </label>
        <label className="field compact">
          Фото или видеозапись
          <select
            aria-label="Источник мониторинга"
            value={file?.id ?? ''}
            disabled={!files.length}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!files.length && <option value="">Материалы не загружены</option>}
            {files.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="monitoring-layout">
        <section className="sheet sheet-pad stack" aria-label="Просмотр площадки">
          <h2 className="h-sec">Фото и видео площадки</h2>
          {file?.url ? (
            <StoredMedia key={file.id} url={file.url} image={file.kind === 'image'} name={file.name} />
          ) : (
            <Empty title={file ? 'Адрес просмотра не предоставлен' : 'Загрузите фото или видео площадки'}>
              Здесь появится выбранный материал. Подключение камер и распознавание ожидают серверного API.
            </Empty>
          )}
        </section>
        <aside className="sheet sheet-pad stack" aria-label="Детекция техники">
          <h2 className="h-sec">Техника в кадре</h2>
          <p>Результаты детекции не получены</p>
          <p className="sub">
            После подключения анализа здесь появятся классы техники, количество и уверенность распознавания, а
            на изображении — рамки найденных объектов.
          </p>
          <p className="sub">Отсутствие результата не означает, что техники на площадке нет.</p>
        </aside>
      </div>
      {file && (
        <div className="sheet sheet-pad">
          <AnalysisPanel fileId={file.id} fileName={file.name} analysis={file.analysis} />
        </div>
      )}
      <section className="sheet sheet-pad stack">
        <div className="section-heading">
          <h2 className="h-sec">Сопоставление с графиком работ</h2>
          <Link className="btn-link" to={route + '/schedule?mode=api'}>
            Открыть график →
          </Link>
        </div>
        {project?.stages.length ? (
          <ul>
            {project.stages.map((stage) => (
              <li key={stage.id}>
                {stage.name} · {stage.start} — {stage.end}
              </li>
            ))}
          </ul>
        ) : (
          <p>График выбранного объекта пока недоступен.</p>
        )}
        <p className="sub">
          Фактическое выполнение и отклонения появятся после получения результатов анализа. До этого проценты
          выполнения не рассчитываются.
        </p>
      </section>
    </>
  );
}
