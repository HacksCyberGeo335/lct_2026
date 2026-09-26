import { useFileOperation } from '../inspection/useFileOperation';
import { useRef, useState } from 'react';
import { useFilters } from '../../app/context';
import { type AnalysisResult, type InspectionFrame } from '../../domain/inspection';
import { useInspectionSession } from '../inspection/session';
import { openImages } from '../inspection/images';
import { ImageViewer } from '../inspection/ImageViewer';
import { readAnalysisFile, downloadJson, downloadResultTemplate } from '../../api/analysisResult';
import { Empty, Modal } from '../../shared/ui';

export function FrameWorkspace({
  objectId,
  threshold,
  disabled = false,
  onBusyChange,
}: {
  objectId: string;
  threshold: number;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { session, addFrames, setFrame, removeFrame } = useInspectionSession(objectId);
  const { params, update } = useFilters();
  const frame = params.has('image')
    ? session.frames.find((f) => f.id === params.get('image'))
    : session.frames[0];
  const { busy, error, message, setMessage, version, run } = useFileOperation(disabled, onBusyChange);
  const resultInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ frame: InspectionFrame; result: AnalysisResult } | null>(null);
  const [remove, setRemove] = useState(false);
  return (
    <section className="catalog-frames stack" aria-label="Наблюдения площадки">
      <div className="sheet sheet-pad stack">
        <h2 className="h-sec">Снимки и результаты распознавания</h2>
        <label className="btn btn-primary inspection-file">
          Добавить снимки
          <input
            aria-label="Снимки площадки"
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp"
            disabled={busy || disabled}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void run(async (current) => {
                const frames = await openImages(files, session.frames);
                if (current !== version.current) {
                  frames.forEach((f) => URL.revokeObjectURL(f.url));
                  return;
                }
                addFrames(frames);
                if (frames[0]) update({ image: frames[0].id });
                setMessage('Снимки добавлены локально. Анализ не запускался.');
              });
            }}
          />
        </label>
        <p className="sub">
          PNG, JPEG, WebP · до 20 МБ на файл, 50 снимков / 200 МБ за сеанс. После перезагрузки снимки нужно
          выбрать заново. На сервер они не отправляются.
        </p>
        {busy && <p role="status">Проверяем файлы…</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {!!session.frames.length && (
        <div className="inspection-filmstrip" role="group" aria-label="Снимки текущего объекта">
          {session.frames.map((f) => (
            <button
              className="inspection-thumb"
              key={f.id}
              aria-pressed={f.id === frame?.id}
              disabled={busy || disabled}
              onClick={() => {
                setPending(null);
                update({ image: f.id });
              }}
            >
              <img src={f.url} alt="" loading="lazy" />
              <span>{f.name}</span>
              <small>
                {f.origin === 'demo' ? 'Демо' : f.result ? 'Результат импортирован' : 'Без анализа'}
              </small>
            </button>
          ))}
        </div>
      )}
      {!frame ? (
        <div className="sheet">
          <Empty
            title={session.frames.length ? 'Снимок недоступен' : 'Добавьте снимки или откройте пример'}
            action={
              session.frames.length ? (
                <button className="btn btn-quiet" onClick={() => update({ image: null })}>
                  Выбрать доступный снимок
                </button>
              ) : undefined
            }
          >
            Для своих файлов импортируйте JSON распознавания. API анализа снимков в этой ветке ещё нет.
          </Empty>
        </div>
      ) : (
        <div className="inspection-board">
          <ImageViewer key={frame.id} frame={frame} threshold={threshold} />
          <aside className="sheet sheet-pad stack">
            <h3 className="h-sec">Результат анализа</h3>
            <p>
              {frame.resultSource === 'import'
                ? 'Импортированный JSON'
                : frame.origin === 'demo'
                  ? 'Синтетический пример'
                  : 'Анализ не получен'}
            </p>
            {frame.result && (
              <dl className="detail-grid">
                <div>
                  <dt>Камера / зона</dt>
                  <dd>
                    {frame.result.camera_id} / {frame.result.zone}
                  </dd>
                </div>
                <div>
                  <dt>Время · Москва</dt>
                  <dd>
                    {new Date(frame.result.captured_at).toLocaleString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Состояние</dt>
                  <dd>
                    {
                      { waiting: 'Ожидание', running: 'Обработка', succeeded: 'Завершён', failed: 'Ошибка' }[
                        frame.result.state
                      ]
                    }
                  </dd>
                </div>
                <div>
                  <dt>Модель / источник</dt>
                  <dd>{frame.result.model}</dd>
                </div>
              </dl>
            )}
            {frame.result?.error && <p role="alert">{frame.result.error}</p>}
            <label className="field">
              Импортировать результат анализа (JSON)
              <input
                ref={resultInput}
                type="file"
                accept=".json"
                disabled={busy || disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file)
                    void run(async (current) => {
                      const result = await readAnalysisFile(file, frame);
                      if (current === version.current) setPending({ frame, result });
                    });
                }}
              />
            </label>
            <p className="sub">
              Проверяются SHA-256, имя и размеры снимка. Импорт не запускает распознавание.
            </p>
            <button className="btn btn-quiet" onClick={() => downloadResultTemplate(frame)}>
              Скачать шаблон результата
            </button>
            {frame.result && (
              <button
                className="btn btn-quiet"
                onClick={() => downloadJson(frame.result, frame.name + '.result.json')}
              >
                Скачать текущий результат
              </button>
            )}
            <button className="btn btn-quiet" disabled={busy || disabled} onClick={() => setRemove(true)}>
              Убрать снимок из сеанса
            </button>
          </aside>
        </div>
      )}
      <Modal
        returnFocusRef={resultInput}
        open={!!pending}
        onClose={() => setPending(null)}
        title="Применить результат анализа?"
        description="Результат заменит анализ только у снимка с совпадающими именем, SHA-256 и размерами."
      >
        {pending && (
          <>
            <p>
              {pending.frame.name} · камера {pending.result.camera_id} · зона {pending.result.zone} ·{' '}
              {pending.result.captured_at}
            </p>
            <p>
              Детекций: {pending.result.detections.length} · {pending.result.model}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setFrame({ ...pending.frame, result: pending.result, resultSource: 'import' });
                setPending(null);
                setMessage('Результат импортирован. Наблюдения пересчитаны.');
              }}
            >
              Применить результат
            </button>
          </>
        )}
      </Modal>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title="Убрать снимок?"
        description="Снимок и его результат исчезнут из сеанса. Файл на диске сохранится."
      >
        <button
          className="btn btn-primary"
          onClick={() => {
            if (frame) removeFrame(frame);
            update({ image: null });
            setRemove(false);
          }}
        >
          Убрать снимок
        </button>
      </Modal>
    </section>
  );
}
