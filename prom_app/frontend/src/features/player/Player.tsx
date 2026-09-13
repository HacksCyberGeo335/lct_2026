import { useLayoutEffect, useRef, useState } from 'react';
import { Scene } from './Scene';
import { usePlayback, formatPlaybackTime as clock } from './usePlayback';
import {
  CAPTURED,
  classes,
  containRect,
  eventsAt,
  type Camera,
  type ProcessingState,
  type Recording,
} from '../../domain/models';
import { detectionsAt, positionAt, scenarios } from '../../demo/observations';
import { Empty } from '../../shared/ui';
export function Player({
  camera,
  recording,
  requestedTime,
  onSeek,
}: {
  camera: Camera | null;
  recording: Recording;
  requestedTime: number;
  onSeek: (n: number) => void;
}) {
  const synthetic = recording.kind !== 'video',
    stills = recording.kind === 'synthetic';
  const [boxes, setBoxes] = useState(true),
    [trails, setTrails] = useState(false),
    [scenario, setScenario] = useState<ProcessingState>(recording.processing);
  const {
    video,
    time,
    duration,
    playing,
    hasFrame,
    error: mediaError,
    seek,
    play,
    retry,
    mediaEvents,
  } = usePlayback(stills, recording.duration, requestedTime, onSeek);
  const host = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const measuredEmpty = synthetic && hasFrame && !mediaError && camera?.available && scenario === 'empty';
  const canObserve = synthetic && hasFrame && !mediaError && camera?.available && scenario === 'succeeded';
  const detections = canObserve ? detectionsAt(camera.boxes, time) : [];
  const events = canObserve ? eventsAt(camera.boxes, time) : [];
  const hasTracks = camera?.boxes.some((d) => d.trackId !== null) ?? false;
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setRect(containRect(entry.contentRect.width, entry.contentRect.height, 1600, 900)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="board">
      <div className="board-main">
        <section className="sheet monitor">
          <div className="monitor-heading">
            <h2 className="h-sec">{synthetic ? 'Кадры с площадки' : 'Просмотр записи'}</h2>
            <span className="eyebrow">
              {stills ? 'Серия демоснимков' : synthetic ? 'Синтетическая видеозапись' : 'Архивная запись'}
            </span>
          </div>
          <div ref={host} className="media-host">
            {stills ? (
              <Scene detections={camera?.available ? detectionsAt(camera.boxes, time) : []} />
            ) : (
              <video
                ref={video}
                src={recording.url ?? undefined}
                preload="metadata"
                playsInline
                {...mediaEvents}
              />
            )}
            <div className="media-label mono">
              {camera?.name ?? 'Локальная запись'}
              <span>{synthetic ? 'Демонстрация' : 'Загруженный файл'}</span>
            </div>
            {synthetic && canObserve && (
              <svg
                className="detection-overlay"
                data-testid="detection-overlay"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                viewBox="0 0 1600 900"
                aria-label="Рамки детекций"
              >
                {trails &&
                  hasTracks &&
                  detections
                    .filter((d) => d.trackId)
                    .map((d) => (
                      <polyline
                        key={d.id}
                        points={Array.from({ length: Math.floor((time - d.from) / 5) + 1 }, (_, i) => {
                          const p = positionAt(
                            camera!.boxes.find((x) => x.id === d.id)!,
                            d.from + i * 5,
                          );
                          return (p.x + p.width / 2) * 1600 + ',' + (p.y + p.height) * 900;
                        }).join(' ')}
                        stroke={classes[d.cls].color}
                        strokeWidth="3"
                        fill="none"
                      />
                    ))}
                {boxes &&
                  detections.map((d) => (
                    <g key={d.id} data-testid="detection">
                      <rect
                        x={d.x * 1600}
                        y={d.y * 900}
                        width={d.width * 1600}
                        height={d.height * 900}
                        fill="none"
                        stroke={classes[d.cls].color}
                        strokeWidth="3"
                      />
                      <rect
                        x={d.x * 1600}
                        y={d.y * 900 - 28}
                        width="270"
                        height="28"
                        fill={classes[d.cls].color}
                      />
                      <text
                        x={d.x * 1600 + 8}
                        y={d.y * 900 - 8}
                        fill="white"
                        fontSize="18"
                        fontFamily="monospace"
                      >
                        {classes[d.cls].label +
                          ' ' +
                          d.confidence.toFixed(2) +
                          (d.trackId ? ' · ' + d.trackId : '')}
                      </text>
                    </g>
                  ))}
              </svg>
            )}
          </div>
          {mediaError && (
            <div role="alert" className="query-state">
              <p>{mediaError}</p>
              <button className="btn btn-quiet" onClick={retry}>
                Повторить воспроизведение
              </button>
            </div>
          )}
          <div className="deck">
            {!stills && (
              <button
                className="play icon-button"
                aria-label={playing ? 'Пауза' : 'Воспроизвести'}
                onClick={() => void play()}
              >
                {playing ? 'Ⅱ' : '▷'}
              </button>
            )}
            <label className="time-control">
              <span className="sr-only">{stills ? 'Время снимка' : 'Положение в записи'}</span>
              <input
                type="range"
                min="0"
                max={duration ?? 1}
                disabled={duration === null || !!mediaError}
                step={stills ? 5 : 0.1}
                value={Math.min(time, duration ?? 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-valuetext={clock(time)}
              />
            </label>
            <span className="mono small-text">
              {clock(time)} / {clock(duration)}
            </span>
            <label className="check">
              <input
                type="checkbox"
                checked={boxes}
                disabled={!canObserve}
                onChange={(e) => setBoxes(e.target.checked)}
              />
              Рамки
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={trails}
                disabled={!canObserve || !hasTracks}
                onChange={(e) => setTrails(e.target.checked)}
              />
              Траектории
            </label>
          </div>
          <div className="monitor-bottom">
            <p className="sub">
              {synthetic
                ? 'Снимок: ' +
                  new Date(Date.parse(CAPTURED) + time * 1000).toLocaleString('ru-RU', {
                    timeZone: 'Europe/Moscow',
                  }) +
                  ' · UTC+3. Схема, не реальная съёмка.'
                : 'Время съёмки неизвестно. Анализ загруженного файла недоступен.'}
            </p>
            {synthetic && (
              <label className="field compact">
                Сценарий демонстрации
                <select value={scenario} onChange={(e) => setScenario(e.target.value as ProcessingState)}>
                  {scenarios.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!hasTracks && synthetic && (
              <p className="sub">Трекинг для этого источника отсутствует; траектории недоступны.</p>
            )}
            {synthetic && !camera?.available ? (
              <p role="status">Камера недоступна. Наблюдений нет.</p>
            ) : scenario === 'waiting' || scenario === 'running' ? (
              <p role="status">
                {scenario === 'waiting' ? 'Запись ожидает обработки.' : 'Демонстрация состояния обработки.'}{' '}
                Результатов пока нет.
              </p>
            ) : scenario === 'failed' ? (
              <p role="alert" className="error-text">
                Анализ завершился ошибкой.{' '}
                <button className="btn-link" onClick={() => setScenario('succeeded')}>
                  Повторить демоанализ
                </button>
              </p>
            ) : scenario === 'empty' ? (
              <p role="status">Анализ завершён: техника не обнаружена.</p>
            ) : null}
          </div>
        </section>
      </div>
      <aside className="rail" aria-label="Сводка выбранного источника">
        <section className="sheet tally">
          <div className="tally-top">
            <h2 className="eyebrow">Техника в кадре</h2>
            <span className="mono small-text">{clock(time)}</span>
          </div>
          <div className="tally-num" data-testid="frame-count">
            {canObserve || measuredEmpty ? detections.length : '—'}
          </div>
          <p className="tally-unit">Только выбранные камера и снимок</p>
          <div className="tally-list">
            {Object.entries(classes).map(([key, c]) => (
              <div className="tally-item" key={key}>
                <span className="n">
                  <i className="swatch" style={{ background: c.color }} />
                  {c.plural}
                </span>
                <span className="mono">
                  {canObserve || measuredEmpty ? detections.filter((d) => d.cls === key).length : '—'}
                </span>
              </div>
            ))}
          </div>
          <p className="sub">
            {canObserve && hasTracks
              ? 'Уникальных треков до ' +
                clock(time) +
                ': ' +
                new Set(
                  camera!.boxes
                    .filter((d) => d.from <= time)
                    .map((d) => d.trackId)
                    .filter(Boolean),
                ).size
              : 'Уникальная техника: нет расчёта'}
          </p>
        </section>
        <section className="sheet sheet-pad">
          <h2 className="eyebrow">Лента событий</h2>
          <p className="sub">Выбранный источник · до {clock(time)}</p>
          <div className="events" data-testid="event-list">
            {events.length ? (
              events.map((e) => (
                <button className="event" key={e.id} onClick={() => seek(e.time)}>
                  <span className="swatch" style={{ background: classes[e.detection.cls].color }} />
                  <span>
                    <b>{classes[e.detection.cls].label}</b>{' '}
                    {e.kind === 'entered' ? 'появился' : 'покинул кадр'}
                    <small className="mono">
                      {clock(e.time)} · {e.detection.trackId ?? 'Без трека'}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <Empty title="Нет событий">
                {canObserve ? 'На выбранный момент наблюдений нет.' : 'Результаты наблюдений недоступны.'}
              </Empty>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
