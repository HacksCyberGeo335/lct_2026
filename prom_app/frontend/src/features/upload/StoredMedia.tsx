import { useState } from 'react';
export function StoredMedia({ url, image, name }: { url: string; image: boolean; name: string }) {
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
