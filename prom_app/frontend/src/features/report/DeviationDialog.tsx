import { Link } from 'react-router-dom';
import { equipmentInfo, formatDate, type Project, type Stage } from '../../domain/models';
import { resourcesOf } from '../../domain/plan';
import { evaluateFrame } from '../../domain/inspection';
import { useInspectionSession } from '../inspection/session';
import { AssessmentCard } from '../inspection/AssessmentCard';
import { useFilters, objectUrl } from '../../app/context';
import { Modal } from '../../shared/ui';
export function DeviationDialog({
  project,
  stage,
  onClose,
}: {
  project: Project;
  stage: Stage | null;
  onClose: () => void;
}) {
  const { params } = useFilters(),
    { session } = useInspectionSession(project.id);
  const observations = stage
    ? session.frames.flatMap((frame) =>
        evaluateFrame(project.stages, frame)
          .filter(
            (a) =>
              a.stage.id === stage.id &&
              !['inactive', 'other-zone'].includes(a.status) &&
              frame.result !== null,
          )
          .map((a) => ({ frame, assessment: a })),
      )
    : [];
  const target = new URLSearchParams(params);
  if (stage) target.set('stage', stage.id);
  target.delete('image');
  target.set('plan', 'calendar');
  return (
    <Modal
      open={!!stage}
      onClose={onClose}
      title={stage?.name ?? 'Подробности этапа'}
      description="Требования плана и результаты по снимкам, связанным с этим этапом по дате и зоне."
    >
      {stage && (
        <>
          <dl className="detail-grid">
            <div>
              <dt>Плановый период</dt>
              <dd>
                {formatDate(stage.start)} — {formatDate(stage.end)}
              </dd>
            </div>
            <div>
              <dt>Зона работ</dt>
              <dd>{stage.zone || 'Не задана'}</dd>
            </div>
          </dl>
          <h3>Необходимая техника</h3>
          {resourcesOf(stage).length ? (
            <ul>
              {resourcesOf(stage).map((r) => (
                <li key={r.equipment}>
                  {equipmentInfo(r.equipment).plural}: {r.quantity}
                </li>
              ))}
            </ul>
          ) : (
            <p>Правило для этого этапа не задано или это сводный этап.</p>
          )}
          {observations.length ? (
            observations.map(({ frame, assessment }) => {
              const evidence = new URLSearchParams(target);
              evidence.set('image', frame.id);
              return (
                <div key={frame.id}>
                  <AssessmentCard assessment={assessment} />
                  <Link
                    className="btn btn-quiet"
                    to={objectUrl(project.id, 'inspection', evidence)}
                    onClick={onClose}
                  >
                    Открыть снимок-основание: {frame.name} →
                  </Link>
                </div>
              );
            })
          ) : (
            <p>
              Подходящих снимков с результатами для этого этапа пока нет. Проценты модельного прогресса не
              подтверждают наличие или отсутствие техники.
            </p>
          )}
          <Link
            className="btn btn-primary"
            to={objectUrl(project.id, 'inspection', target)}
            onClick={onClose}
          >
            Проверить снимки для этапа →
          </Link>
        </>
      )}
    </Modal>
  );
}
