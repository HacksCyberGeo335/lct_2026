import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import {
  buildStorageObjectUrl,
  completeVideoUpload,
  initVideoUpload,
  uploadVideoToStorage,
  UploadSession,
  validateVideo,
} from '../../api/videoApi';
import { Modal, Notice } from '../../shared/ui';
type Phase = 'idle' | 'preparing' | 'transferring' | 'confirming' | 'success' | 'error' | 'cancelled';
const labels: Record<Phase, string> = {
  idle: 'Файл готов к загрузке',
  preparing: 'Подготовка загрузки',
  transferring: 'Передача в хранилище',
  confirming: 'Подтверждение сервером',
  success: 'Видео загружено',
  error: 'Загрузка не завершена',
  cancelled: 'Передача отменена',
};
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
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [phase, setPhase] = useState<Phase>('idle'),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [uuid, setUuid] = useState('');
  const session = useRef<UploadSession | null>(null),
    aborter = useRef<AbortController | null>(null),
    busyRef = useRef(false);
  const busy = ['preparing', 'transferring', 'confirming'].includes(phase);
  useEffect(() => () => aborter.current?.abort(), []);
  function select(next: File | null) {
    if (busyRef.current) return;
    const issue = next ? validateVideo(next) : null;
    setFile(issue ? null : next);
    setError(issue ?? '');
    setPhase('idle');
    setProgress(null);
    setUuid('');
    session.current = null;
  }
  function close() {
    if (busyRef.current) aborter.current?.abort();
    setOpen(false);
  }
  async function run() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    aborter.current = controller;
    setError('');
    try {
      let id: string, url: string;
      if (mode === 'demo') {
        // Local object URL is immediate; there is no byte-transfer progress or simulated ML.
        controller.signal.throwIfAborted();
        id = 'local-' + crypto.randomUUID();
        url = URL.createObjectURL(file);
      } else {
        session.current ??= new UploadSession({
          init: (f, s) => initVideoUpload(apiBase, f, s),
          put: uploadVideoToStorage,
          complete: (id, s) => completeVideoUpload(apiBase, id, s),
        });
        const ticket = await session.current.run(file, controller.signal, setPhase, setProgress);
        id = ticket.uuid;
        url = buildStorageObjectUrl(ticket);
      }
      addRecording({
        id,
        objectId,
        cameraId,
        name: file.name,
        kind: 'video',
        url,
        capturedAt: '',
        duration: 0,
        processing: 'unsupported',
      });
      setUuid(id);
      setPhase('success');
      onSelected?.(id);
    } catch (e) {
      setUuid(session.current?.ticket?.uuid ?? '');
      setPhase(controller.signal.aborted ? 'cancelled' : 'error');
      setError(
        controller.signal.aborted
          ? 'Отмена не удаляет созданную запись или частичный объект на сервере.'
          : e instanceof Error
            ? e.message
            : 'Неизвестная ошибка',
      );
    } finally {
      busyRef.current = false;
    }
  }
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + Загрузить запись
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Загрузка записи"
        description={
          mode === 'demo'
            ? 'Локальный просмотр в деморежиме. Файл остаётся в браузере до закрытия вкладки.'
            : 'Файл передаётся в MinIO, затем Gateway подтверждает загрузку.'
        }
      >
        <p className="sub">
          MP4, WebM или MOV · до 2 ГБ (лимит интерфейса). Поддержка воспроизведения зависит от кодека. Сервер
          не проверяет формат видео.
        </p>
        <label
          className={'dropzone' + (busy ? ' disabled' : '')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            select(e.dataTransfer.files[0] ?? null);
          }}
        >
          <strong>{file ? file.name : 'Выберите или перетащите видео'}</strong>
          <span>
            {file
              ? (file.size / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ'
              : 'Один файл за раз'}
          </span>
          <input
            aria-label="Файл записи"
            type="file"
            accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
            disabled={busy}
            onChange={(e) => select(e.target.files?.[0] ?? null)}
          />
        </label>
        {mode === 'api' && (
          <p className="sub">
            Связь видео с объектом и камерой доступна только в текущем сеансе: сервер не принимает эти поля.
          </p>
        )}
        {progress !== null && (
          <div className="upload-progress">
            <progress max="100" value={progress} aria-label="Передано файла" />
            <span className="mono">{progress}%</span>
          </div>
        )}
        {phase !== 'idle' && <p role="status">{labels[phase]}</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {uuid && <p className="mono small-text">UUID: {uuid}</p>}
        {phase === 'success' ? (
          <>
            <Notice>
              {mode === 'api'
                ? 'READY: видео загружено; анализ пока недоступен.'
                : 'Видео открыто локально. Распознавание этого файла не выполнялось.'}
            </Notice>
            <button className="btn btn-primary" onClick={close}>
              Перейти к записи
            </button>
          </>
        ) : (
          <div className="actions">
            <button className="btn btn-primary" disabled={!file || busy} onClick={() => void run()}>
              {session.current?.transferred
                ? 'Повторить подтверждение'
                : session.current?.ticket
                  ? 'Повторить передачу'
                  : mode === 'demo'
                    ? 'Открыть локально'
                    : 'Загрузить видео'}
            </button>
            {busy && (
              <button className="btn btn-quiet" onClick={() => aborter.current?.abort()}>
                Отменить передачу
              </button>
            )}
          </div>
        )}
        {phase === 'error' && !session.current?.ticket && mode === 'api' && (
          <p className="sub">
            Результат инициализации может быть неизвестен. Новый ручной запуск может создать ещё одну запись.
          </p>
        )}
      </Modal>
    </>
  );
}
