import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import {
  storageReadUrl,
  completeVideoUpload,
  initVideoUpload,
  uploadVideoToStorage,
  UploadSession,
} from '../../api/videoApi';
import {
  imageFormatLabel,
  mediaAccept,
  mediaKind,
  validateMediaBatch,
  videoFormatLabel,
} from '../../shared/mediaFiles';
import { Modal, Notice } from '../../shared/ui';

type Phase = 'idle' | 'preparing' | 'transferring' | 'confirming' | 'success' | 'error' | 'cancelled';
const labels: Record<Phase, string> = {
  idle: 'Ожидает загрузки',
  preparing: 'Подготовка загрузки',
  transferring: 'Передача в хранилище',
  confirming: 'Подтверждение сервером',
  success: 'Загружено',
  error: 'Загрузка не завершена',
  cancelled: 'Передача отменена',
};
interface UploadItem {
  file: File;
  session: UploadSession;
  phase: Phase;
  progress: number | null;
  uuid: string;
}
export function Upload({
  objectId = '',
  cameraId = null,
  onSelected,
}: {
  objectId?: string;
  cameraId?: string | null;
  onSelected?: (id: string) => void;
}) {
  const { mode, apiBase, addRecording } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  const hintId = useId();
  const aborter = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  useEffect(() => () => aborter.current?.abort(), []);
  const completed = items.filter((item) => item.phase === 'success').length;
  const success = items.length > 0 && completed === items.length;
  const next = items.find((item) => item.phase !== 'success');
  function select(files: File[]) {
    if (busyRef.current || !files.length) return;
    const issue = validateMediaBatch(files);
    setError(issue ?? '');
    setItems(
      issue
        ? []
        : files.map((file) => ({
            file,
            phase: 'idle',
            progress: null,
            uuid: '',
            session: new UploadSession({
              init: (f, s) => initVideoUpload(apiBase, f, s),
              put: uploadVideoToStorage,
              complete: (id, s) => completeVideoUpload(apiBase, id, s),
            }),
          })),
    );
  }
  function close() {
    if (busyRef.current) aborter.current?.abort();
    setOpen(false);
  }
  async function run() {
    if (!next || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const controller = new AbortController();
    aborter.current = controller;
    setError('');
    try {
      // Sequential uploads bound network usage. Successful items are never retried.
      for (const item of items) {
        if (item.phase === 'success') continue;
        const update = (patch: Partial<UploadItem>) => {
          setItems((current) =>
            current.map((entry) => (entry.session === item.session ? { ...entry, ...patch } : entry)),
          );
        };
        try {
          controller.signal.throwIfAborted();
          update({ progress: null });
          let id: string, url: string | null;
          if (mode === 'demo') {
            id = 'local-' + crypto.randomUUID();
            url = URL.createObjectURL(item.file);
          } else {
            const ticket = await item.session.run(
              item.file,
              controller.signal,
              (phase) => update({ phase }),
              (progress) => update({ progress }),
            );
            id = ticket.uuid;
            url = storageReadUrl(ticket);
          }
          addRecording({
            id,
            objectId,
            cameraId,
            name: item.file.name,
            kind: mediaKind(item.file)!,
            url,
            capturedAt: '',
            duration: 0,
            processing: 'unsupported',
          });
          update({ uuid: id, phase: 'success' });
          onSelected?.(id);
        } catch (e) {
          update({
            uuid: item.session.ticket?.uuid ?? '',
            phase: controller.signal.aborted ? 'cancelled' : 'error',
          });
          setError(
            item.file.name +
              ': ' +
              (controller.signal.aborted
                ? 'Отмена не удаляет созданную запись или частичный объект на сервере.'
                : e instanceof Error
                  ? e.message
                  : 'Неизвестная ошибка'),
          );
          break;
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + Загрузить фото или видео
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Загрузка фото и видео"
        description={
          mode === 'demo'
            ? 'Локальный просмотр без отправки на сервер. После перезагрузки файлы нужно выбрать заново.'
            : 'Файлы по очереди передаются в хранилище. Для каждого файла сервер подтверждает загрузку.'
        }
      >
        <div id={hintId} className="sub stack">
          <p>Видео: {videoFormatLabel}. Одно видео до 2 ГБ.</p>
          <p>Фото: {imageFormatLabel}. До 50 фото за раз, до 20 МБ каждое и 200 МБ суммарно.</p>
          <p>
            Это лимиты интерфейса. Просмотр зависит от формата и кодека браузера; загрузка не запускает
            анализ.
          </p>
        </div>
        <label
          className={'dropzone' + (busy ? ' disabled' : '')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            select(Array.from(e.dataTransfer.files));
          }}
        >
          <strong>Выберите или перетащите фото или видео</strong>
          <span>Одно видео или несколько фото</span>
          <input
            aria-label="Фото или видео"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={!!error}
            type="file"
            accept={mediaAccept}
            multiple
            disabled={busy}
            onChange={(e) => {
              select(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </label>
        {!!items.length && (
          <>
            <p role="status">
              Загружено: {completed} из {items.length}
              {busy ? ' · передача выполняется…' : ''}
            </p>
            <ol className="upload-queue" aria-label="Очередь загрузки">
              {items.map((item, index) => (
                <li key={index} className="stack">
                  <strong>{item.file.name}</strong>
                  <span className="sub">
                    {(item.file.size / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ
                    · {labels[item.phase]}
                  </span>
                  {item.progress !== null && item.phase === 'transferring' && (
                    <div className="upload-progress">
                      <progress max="100" value={item.progress} aria-label={'Передано: ' + item.file.name} />
                      <span className="mono">{item.progress}%</span>
                    </div>
                  )}
                  {item.uuid && <span className="mono small-text">UUID: {item.uuid}</span>}
                </li>
              ))}
            </ol>
          </>
        )}
        {error && (
          <p id={errorId} className="error-text" role="alert">
            {error}
          </p>
        )}
        {mode === 'api' && (
          <p className="sub">
            Связь файлов с объектом и камерой хранится только в текущем сеансе: сервер не принимает эти поля.
          </p>
        )}
        {success ? (
          <>
            <Notice>
              {mode === 'api'
                ? 'READY: файлы загружены; анализ пока недоступен.'
                : 'Файлы открыты локально. Распознавание не выполнялось.'}
            </Notice>
            <button className="btn btn-primary" onClick={close}>
              Перейти к файлам
            </button>
          </>
        ) : (
          <div className="actions">
            <button className="btn btn-primary" disabled={!next || busy} onClick={() => void run()}>
              {next?.session.transferred
                ? 'Повторить подтверждение'
                : next?.session.ticket
                  ? 'Повторить передачу'
                  : mode === 'demo'
                    ? 'Открыть локально'
                    : completed
                      ? 'Продолжить загрузку'
                      : 'Загрузить файлы'}
            </button>
            {busy && (
              <button className="btn btn-quiet" onClick={() => aborter.current?.abort()}>
                Отменить передачу
              </button>
            )}
          </div>
        )}
        {completed > 0 && !success && (
          <p className="sub">
            Уже загруженные файлы сохранены. Повтор продолжит очередь с незавершённого файла.
          </p>
        )}
        {next?.phase === 'error' && !next.session.ticket && mode === 'api' && (
          <p className="sub">
            Результат инициализации может быть неизвестен. Новый ручной запуск может создать ещё одну запись.
          </p>
        )}
      </Modal>
    </>
  );
}
