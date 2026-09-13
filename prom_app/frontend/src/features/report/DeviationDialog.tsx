import { Link } from 'react-router-dom';
import { classes, deltaText, formatDate, type Project, type Stage } from '../../domain/models';
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
    camera = project.cameras.find((c) => c.available);
  const observed =
    stage?.equipment && camera
      ? camera.boxes.filter((d) => d.cls === stage.equipment && d.from <= 15 && d.to > 15).length
      : null;
  const evidence = new URLSearchParams(params);
  evidence.set('camera', camera?.id ?? '');
  evidence.set('recording', 'sample');
  evidence.set('t', '15');
  return (
    <Modal
      open={!!stage}
      onClose={onClose}
      title={stage?.name ?? 'Подробности этапа'}
      description="Основания и ограничения модельного примера отклонения."
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
            <div>
              <dt>Расхождение факта и плана</dt>
              <dd>
                {deltaText(stage.fact !== null && stage.plan !== null ? stage.fact - stage.plan : null)}
              </dd>
            </div>
            <div>
              <dt>Ожидаемые ресурсы</dt>
              <dd>
                {stage.equipment ? classes[stage.equipment].plural : 'Не заданы'} · {stage.quantity ?? '—'}
              </dd>
            </div>
            <div>
              <dt>В доступном снимке</dt>
              <dd>
                {observed ?? 'Нет наблюдений'} {observed === null ? '' : 'единиц'}
              </dd>
            </div>
            <div>
              <dt>Полнота наблюдений объекта</dt>
              <dd>
                {project.coverage === null
                  ? 'Нет наблюдений'
                  : project.coverage + '% · демонстрационный показатель'}
              </dd>
            </div>
          </dl>
          <p className="sub">
            Срез 25.08.2026, UTC+3. Снимок отражает одну камеру в один момент и не доказывает отсутствие
            техники вне кадра. Возможная нехватка ресурсов требует проверки на площадке. Confidence детектора
            не равен вероятности выполнения работ.
          </p>
          {stage.fact === null ? (
            <p>Импортирован только план. Фактических наблюдений для этого этапа ещё нет.</p>
          ) : camera ? (
            <Link className="btn btn-primary" to={objectUrl(project.id, '', evidence)} onClick={onClose}>
              Открыть кадр-основание · 00:15 →
            </Link>
          ) : (
            <p>Кадры-основания недоступны.</p>
          )}
        </>
      )}
    </Modal>
  );
}
