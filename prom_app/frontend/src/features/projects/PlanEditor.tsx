import { useState } from 'react';
import { orderedStages, planSchema } from '../../domain/plan';
import type { Stage } from '../../domain/models';
import { Modal } from '../../shared/ui';
import { ImportPlan } from '../import/ImportPlan';
import { StageForm } from './StageForm';
import { stageBranch } from './model';
import type { WorkPlan } from './repository';
export function PlanEditor({
  plan,
  onChange,
  objectName,
  startImport = false,
}: {
  plan: WorkPlan | null;
  onChange: (plan: WorkPlan | null) => void;
  objectName: string;
  startImport?: boolean;
}) {
  const [edit, setEdit] = useState<{ stage?: Stage } | null>(null);
  const [remove, setRemove] = useState<{ stage?: Stage } | null>(null);
  const [importing, setImporting] = useState(startImport);
  const stages = plan?.stages ?? [];
  function changeStages(next: Stage[]) {
    const parsed = planSchema.safeParse(next);
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(' '));
    onChange({ name: plan?.name ?? 'График работ', stages: parsed.data });
  }
  const removedIds = remove?.stage ? stageBranch(stages, remove.stage.id) : null;
  return (
    <section className="stack" aria-label="Черновик графика">
      <h3 className="h-sec">График работ</h3>
      <p className="sub">
        Черновик формы. Изменения этапов, импорт и удаление применятся к объекту только после сохранения на
        сервере.
      </p>
      {plan ? (
        <label className="field">
          Название графика
          <input
            required
            maxLength={200}
            value={plan.name}
            onChange={(e) => onChange({ ...plan, name: e.target.value })}
          />
        </label>
      ) : (
        <p>График не задан. Можно добавить его сейчас или позднее.</p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>
          Добавить этап вручную
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setImporting(true)}>
          Загрузить CSV графика
        </button>
        {plan && (
          <button type="button" className="btn btn-quiet" onClick={() => setRemove({})}>
            Удалить график
          </button>
        )}
      </div>
      {!!stages.length && (
        <div className="table-scroll">
          <table className="project-stage-table">
            <caption>Этапы: {stages.length}</caption>
            <thead>
              <tr>
                <th>Этап / зона</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {orderedStages(stages).map(({ stage, depth }) => (
                <tr key={stage.id}>
                  <td>
                    <strong>
                      {depth ? '↳ '.repeat(Math.min(depth, 3)) : ''}
                      {stage.name}
                    </strong>
                    <small>{stage.zone || 'Без зоны'}</small>
                  </td>
                  <td>{stage.start}</td>
                  <td>{stage.end}</td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-quiet"
                        aria-label={'Редактировать этап ' + stage.name}
                        onClick={() => setEdit({ stage })}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        aria-label={'Удалить этап ' + stage.name}
                        onClick={() => setRemove({ stage })}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {importing && (
        <ImportPlan
          initialOpen
          objectId="draft"
          targetLabel={objectName}
          onClose={() => setImporting(false)}
          onApply={changeStages}
        />
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.stage ? 'Редактирование этапа' : 'Новый этап'}
        description="Сроки, зона и потребность в технике. Этап добавляется в черновик графика."
      >
        {edit && (
          <StageForm
            stage={edit.stage}
            stages={stages}
            onCancel={() => setEdit(null)}
            onSave={(stage) => {
              changeStages(
                edit.stage ? stages.map((s) => (s.id === stage.id ? stage : s)) : [...stages, stage],
              );
              setEdit(null);
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove?.stage ? 'Удалить этап?' : 'Удалить график?'}
        description={
          remove?.stage
            ? `Из черновика будут удалены «${remove.stage.name}» и его подэтапы. Всего: ${removedIds?.size ?? 1}.`
            : `Из черновика будет удалён график со всеми этапами (${stages.length}). Объект останется.`
        }
      >
        <p>Серверные данные до сохранения объекта не меняются.</p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (removedIds) changeStages(stages.filter((s) => !removedIds.has(s.id)));
              else onChange(null);
              setRemove(null);
            }}
          >
            Подтвердить удаление
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setRemove(null)}>
            Отмена
          </button>
        </div>
      </Modal>
    </section>
  );
}
