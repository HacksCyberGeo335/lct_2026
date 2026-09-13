import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CAPTURED,
  classes,
  containRect,
  eventsAt,
  type Camera,
  type Detection,
  type ProcessingState,
  type Recording,
} from '../../domain/models';
import { detectionsAt, positionAt, scenarios } from '../../demo/observations';
import { Empty } from '../../shared/ui';
export const clock = (seconds: number) =>
  Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0') +
  ':' +
  Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
function Vehicle({ d }: { d: Detection }) {
  return (
    <svg
      x={d.x * 1600}
      y={d.y * 900}
      width={d.width * 1600}
      height={d.height * 900}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="#C9AC65" stroke="#746443" strokeWidth="1.5">
        {d.cls === 'crane' ? (
          <>
            <path d="M43 96V8h13v88M4 17h90v9H4zM48 8L9 17M51 8l40 9" fill="#BAA35F" />
            <path d="M44 20l12 14-12 14 12 14-12 14 12 14M78 24v43h-7" fill="none" />
            <rect x="30" y="27" width="32" height="13" />
            <rect x="32" y="92" width="38" height="6" />
          </>
        ) : d.cls === 'exc' ? (
          <>
            <rect x="8" y="76" width="66" height="17" rx="8" fill="#686E67" />
            <rect x="20" y="52" width="46" height="25" rx="4" />
            <path d="M27 53V29h25v24" fill="#637D79" />
            <path d="M57 61L70 20l22 33-4 22-12 9" fill="none" strokeWidth="7" />
            <path d="M72 79l22-8-5 15-13 4z" />
            <path d="M15 84h50" stroke="#BFC3B8" />
          </>
        ) : (
          <>
            <circle cx="25" cy="84" r="10" fill="#59635D" />
            <circle cx="73" cy="84" r="10" fill="#59635D" />
            <path d="M5 73V34h54v40h32v8H6z" />
            <path d="M63 47h17l13 22v12H60V47z" fill="#C4C9B8" />
            <path d="M66 51h10l10 16H66z" fill="#65827F" />
            {d.cls === 'mixer' ? (
              <ellipse cx="33" cy="44" rx="25" ry="27" fill="#D8DCD0" />
            ) : (
              <path d="M9 39h45v25H9z" fill="#B29A60" />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
function Scene({ detections }: { detections: Detection[] }) {
  return (
    <svg
      className="synthetic-scene"
      viewBox="0 0 1600 900"
      role="img"
      aria-label="Демонстрационная схема строительной площадки с техникой"
    >
      <rect width="1600" height="900" fill="#E4E7DF" />
      <path d="M0 170L1600 70V0H0z" fill="#CCD3C8" />
      <path d="M0 680L1600 800v100H0z" fill="#CACFC5" />
      <g fill="#D4D8CD" stroke="#BBC2B5" strokeWidth="2">
        <path d="M850 360l320-95 210 78-330 100z" />
        <path d="M850 360v150l200 80V443z" />
        <path d="M1050 443v147l330-96V343z" fill="#C8CFC3" />
        <path d="M150 210l360-60 125 52-364 80z" />
        <path d="M150 210v62l121 48v-38z" />
        <path d="M271 282v38l364-63v-55z" />
      </g>
      <g stroke="#B5BEAD" strokeWidth="3">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={'M' + (1070 + i * 32) + ' ' + (440 - i * 9) + 'v142'} />
        ))}
      </g>
      <path d="M60 370l490-60 275 160-433 145z" fill="#D8CCB1" stroke="#C1B491" strokeWidth="3" />
      <path d="M60 370v48l325 246 440-142v-52L392 615z" fill="#BCB18F" opacity=".6" />
      <g stroke="#B0BAAC" fill="none" strokeWidth="3">
        <path d="M20 135l1530-68M20 141l1530-68" />
        {Array.from({ length: 24 }, (_, i) => (
          <path key={i} d={'M' + (20 + i * 65) + ' ' + (96 - i * 2.8) + 'v72'} />
        ))}
      </g>
      <path d="M40 744l1480 108" stroke="#E3E5DD" strokeWidth="3" strokeDasharray="22 20" />
      <text x="45" y="845" fill="#667060" fontSize="18" fontFamily="monospace">
        СИНТЕТИЧЕСКАЯ СЦЕНА · 1600 × 900 · ОБУЧАЮЩИЙ ПРИМЕР
      </text>
      {detections.map((d) => (
        <Vehicle key={d.id} d={d} />
      ))}
    </svg>
  );
}
export function Player({
  camera,
  recording,
  time,
  onTime,
}: {
  camera: Camera | null;
  recording: Recording;
  time: number;
  onTime: (n: number) => void;
}) {
  const synthetic = recording.kind !== 'video',
    stills = recording.kind === 'synthetic';
  const [boxes, setBoxes] = useState(true),
    [trails, setTrails] = useState(false),
    [scenario, setScenario] = useState<ProcessingState>(recording.processing),
    [mediaError, setMediaError] = useState(''),
    [playing, setPlaying] = useState(false),
    [duration, setDuration] = useState(recording.duration);
  const video = useRef<HTMLVideoElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const measuredEmpty = synthetic && camera?.available && scenario === 'empty';
  const canObserve = synthetic && camera?.available && scenario === 'succeeded';
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
  useEffect(() => {
    if (video.current && Math.abs(video.current.currentTime - time) > 0.7) video.current.currentTime = time;
  }, [time]);
  function seek(next: number) {
    const value = Math.max(0, Math.min(duration, next));
    if (video.current) video.current.currentTime = value;
    onTime(value);
  }
  async function play() {
    if (!video.current) return;
    try {
      if (video.current.paused) await video.current.play();
      else video.current.pause();
    } catch {
      setMediaError('Браузер не смог воспроизвести запись. Проверьте формат и кодек.');
    }
  }
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
                onError={() => setMediaError('Запись недоступна или её кодек не поддерживается браузером.')}
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  e.currentTarget.currentTime = time;
                }}
                onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
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
              <button
                className="btn btn-quiet"
                onClick={() => {
                  setMediaError('');
                  video.current?.load();
                }}
              >
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
                max={duration || 60}
                step={stills ? 5 : 0.1}
                value={Math.min(time, duration || 60)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-valuetext={clock(time)}
              />
            </label>
            <span className="mono small-text">
              {clock(time)} / {clock(duration || 60)}
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
