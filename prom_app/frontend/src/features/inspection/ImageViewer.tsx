import { useState } from 'react';
import type { InspectionFrame } from '../../domain/inspection';
import { equipmentInfo } from '../../domain/models';
export function ImageViewer({ frame }: { frame: InspectionFrame }) {
  const [boxes, setBoxes] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false);
  const detections = frame.result?.state === 'succeeded' ? frame.result.detections : [];
  return (
    <section className="sheet sheet-pad inspection-viewer">
      <div className="section-heading">
        <h2 className="h-sec">{frame.name}</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={boxes}
            onChange={(e) => setBoxes(e.target.checked)}
            disabled={!loaded || !detections.length}
          />
          Рамки снимка
        </label>
      </div>
      <div className="inspection-image" style={{ aspectRatio: frame.width + '/' + frame.height }}>
        <img
          src={frame.url}
          alt={'Снимок площадки: ' + frame.name}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setError(true);
            setLoaded(false);
          }}
        />
        {loaded && boxes && (
          <svg
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            role="img"
            aria-label="Результаты распознавания на снимке"
          >
            {detections.map((d) => {
              const info = equipmentInfo(d.class_id),
                [x, y, w, h] = d.bbox;
              return (
                <g key={d.id} data-testid="image-detection">
                  <title>
                    {info.label} · уверенность {Math.round(d.confidence * 100)}%
                  </title>
                  <rect
                    x={x * frame.width}
                    y={y * frame.height}
                    width={w * frame.width}
                    height={h * frame.height}
                    fill="none"
                    stroke={info.color}
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={(x + 0.005) * frame.width}
                    y={Math.max(0.025, y - 0.005) * frame.height}
                    fontSize={Math.max(frame.width / 65, 10)}
                    paintOrder="stroke"
                    stroke="white"
                    strokeWidth={Math.max(frame.width / 500, 1)}
                    fill={info.color}
                  >
                    {info.label} {Math.round(d.confidence * 100)}%
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {error && <p role="alert">Снимок недоступен. Добавьте исходный файл заново.</p>}
      <p className="sub">
        {frame.width} × {frame.height} px ·{' '}
        {frame.origin === 'demo'
          ? 'Синтетический пример, результаты заданы вручную'
          : 'Пользовательский снимок'}
        .
      </p>
      {frame.result?.state === 'succeeded' ? (
        <div className="table-scroll">
          <table>
            <caption>Распознанная техника — {detections.length}. Порог для сопоставления: 50%.</caption>
            <thead>
              <tr>
                <th>Класс</th>
                <th>Уверенность</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((d) => (
                <tr key={d.id}>
                  <td>{equipmentInfo(d.class_id).label}</td>
                  <td>{Math.round(d.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!detections.length && <p>Анализ завершён: техника не обнаружена.</p>}
        </div>
      ) : (
        <p className="sub">Детекции появятся после получения результата анализа.</p>
      )}
    </section>
  );
}
