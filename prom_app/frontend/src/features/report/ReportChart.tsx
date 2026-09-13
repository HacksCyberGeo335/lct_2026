import { useState } from 'react';
import { formatDate, formatNumber, type ReportPoint } from '../../domain/models';
import { Legend } from '../../shared/ui';
export function ReportChart({ points }: { points: ReportPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const x = (i: number) => 52 + (i * 620) / (points.length - 1),
    y = (value: number) => 230 - value * 1.95;
  const selected = active === null ? null : points[active];
  return (
    <>
      <Legend />
      <div className="chart-wrap">
        <svg viewBox="0 0 720 280" role="img" aria-labelledby="report-chart-title">
          <title id="report-chart-title">Выполнение плана и наблюдённый факт по датам, проценты</title>
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line className="chart-grid-line" x1="52" x2="672" y1={y(value)} y2={y(value)} />
              <text className="chart-tick" x="10" y={y(value) + 4}>
                {value}%
              </text>
            </g>
          ))}
          <polyline
            points={points.map((p, i) => x(i) + ',' + y(p.plan)).join(' ')}
            className="chart-serie"
            stroke="var(--ink-3)"
            strokeDasharray="7 5"
          />
          <polyline
            points={points.map((p, i) => x(i) + ',' + y(p.fact)).join(' ')}
            className="chart-serie"
            stroke="var(--ok)"
          />
          {points.map((p, i) => (
            <g key={p.date}>
              <circle cx={x(i)} cy={y(p.plan)} r="3" fill="var(--ink-3)" />
              <circle
                cx={x(i)}
                cy={y(p.fact)}
                r="5"
                fill="var(--ok)"
                tabIndex={0}
                role="button"
                aria-label={
                  formatDate(p.date) +
                  ': план ' +
                  formatNumber(p.plan) +
                  '%, факт ' +
                  formatNumber(p.fact) +
                  '%'
                }
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActive(i);
                }}
              />
              <text x={x(i)} y="262" textAnchor="middle" className="chart-tick">
                {formatDate(p.date).slice(0, 5)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="chart-tooltip no-print">
        {selected
          ? formatDate(selected.date) +
            ' · План ' +
            formatNumber(selected.plan) +
            '% · Факт ' +
            formatNumber(selected.fact) +
            '%'
          : 'Наведите указатель или выберите точку клавишей Tab.'}
      </p>
      <details className="chart-data">
        <summary>Данные графика в таблице</summary>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>План, %</th>
              <th>Факт, %</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{formatDate(p.date)}</td>
                <td>{formatNumber(p.plan)}</td>
                <td>{formatNumber(p.fact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
