import { assessmentLabels, type Assessment } from '../../domain/inspection';
import { equipmentInfo, formatDate } from '../../domain/models';
export function AssessmentCard({ assessment }: { assessment: Assessment }) {
  const a = assessment;
  return (
    <article className={'assessment-card ' + a.status} data-testid="assessment">
      <div className="section-heading">
        <h3>{a.stage.name}</h3>
        <strong className="assessment-status">{assessmentLabels[a.status]}</strong>
      </div>
      <p className="sub">
        Зона: {a.stage.zone || 'не задана'} · план {formatDate(a.stage.start)} — {formatDate(a.stage.end)}
      </p>
      <p>{a.reason}</p>
      {!!a.resources.length && (
        <div className="table-scroll">
          <table>
            <caption>Проверка требований этапа</caption>
            <thead>
              <tr>
                <th>Техника</th>
                <th>Ожидается</th>
                <th>В снимке</th>
              </tr>
            </thead>
            <tbody>
              {a.resources.map((r) => (
                <tr key={r.classId}>
                  <td>{equipmentInfo(r.classId).plural}</td>
                  <td>{r.expected}</td>
                  <td>{r.observed ?? 'Нет расчёта'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a.status === 'warning' && (
        <p className="sub">
          Возможен риск снижения темпа работ. Вывод относится к зоне и моменту этого снимка; проверьте охват
          камеры.
        </p>
      )}
    </article>
  );
}
