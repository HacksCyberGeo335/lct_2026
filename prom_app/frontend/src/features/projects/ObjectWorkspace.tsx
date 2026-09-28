import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Modal, QueryState } from '../../shared/ui';
import { planSchema } from '../../domain/plan';
import { emptyProjectFields, projectFieldsSchema, type ProjectFields } from './model';
import { ProjectForm } from './ProjectForm';
import { PlanEditor } from './PlanEditor';
import { projectRepository, type ManagedProject, type ProjectRepository, type WorkPlan } from './repository';

type Workflow = { kind: 'object' | 'plan'; csv?: boolean; project?: ManagedProject };
export function ObjectWorkspace({ repository = projectRepository }: { repository?: ProjectRepository }) {
  const { objectId } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['api', 'managed-projects'],
    queryFn: ({ signal }) => repository.list(signal),
    enabled: repository.available,
    retry: false,
  });
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [remove, setRemove] = useState<ManagedProject | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const [message, setMessage] = useState('');
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['api', 'managed-projects'] }),
      client.invalidateQueries({ queryKey: ['api', 'objects'] }),
    ]);
  }
  const projects = query.data ?? [];
  const displayed =
    objectId && projects.some((p) => p.id === objectId)
      ? projects.filter((p) => p.id === objectId)
      : projects;
  return (
    <section className="sheet sheet-pad stack" aria-label="Объекты и графики">
      <div className="section-heading">
        <h2 className="h-sec">Объекты и графики работ</h2>
        <span className="sub">{repository.available ? 'Серверные данные' : 'API ещё не подключён'}</span>
      </div>
      {!repository.available && (
        <p className="inspection-notice">
          Можно заполнить карточку объекта, подготовить этапы или проверить CSV. Сохранение, загрузка списка
          существующих объектов и удаление на сервере пока недоступны. Черновик существует только в открытой
          форме и исчезнет при её закрытии или перезагрузке. В браузерное хранилище данные не записываются.
        </p>
      )}
      {!workflow && (
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setWorkflow({ kind: 'object' })}>
            Добавить объект
          </button>
          <button className="btn btn-quiet" onClick={() => setWorkflow({ kind: 'plan' })}>
            Создать график работ
          </button>
          <button className="btn btn-quiet" onClick={() => setWorkflow({ kind: 'plan', csv: true })}>
            Импорт CSV графика
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {repository.available && (
        <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
      )}
      {workflow ? (
        <ProjectWorkflow
          workflow={workflow}
          projects={projects}
          repository={repository}
          onCancel={() => setWorkflow(null)}
          onSaved={async () => {
            setWorkflow(null);
            setMessage('Объект и его график сохранены на сервере.');
            await refresh();
          }}
        />
      ) : (
        <>
          {repository.available && query.isSuccess && !projects.length && (
            <p>Объектов пока нет. Добавьте первый объект или начните с графика работ.</p>
          )}
          {displayed.map((project) => (
            <article className="project-card stack" key={project.id}>
              <h3 className="h-sec">{project.name}</h3>
              <p>{project.address}</p>
              <dl className="detail-grid">
                <div>
                  <dt>Застройщик</dt>
                  <dd>{project.developer}</dd>
                </div>
                <div>
                  <dt>Разрешение</dt>
                  <dd>{project.permit || 'Не указано'}</dd>
                </div>
                <div>
                  <dt>График</dt>
                  <dd>{project.plan?.name ?? 'Не задан'}</dd>
                </div>
                <div>
                  <dt>Этапов</dt>
                  <dd>{project.plan?.stages.length ?? 0}</dd>
                </div>
              </dl>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => setWorkflow({ kind: 'object', project })}>
                  Редактировать объект и график
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => setWorkflow({ kind: 'plan', project, csv: true })}
                >
                  Загрузить CSV в объект
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setError('');
                    setRemove(project);
                  }}
                >
                  Удалить объект
                </button>
              </div>
            </article>
          ))}
        </>
      )}
      <Modal
        open={!!remove}
        onClose={() => {
          if (!deleting.current) setRemove(null);
        }}
        title="Удалить объект?"
        description={`Будут удалены объект «${remove?.name ?? ''}», его график и этапы. Это действие нельзя отменить.`}
      >
        <p>Загруженные фото и видео этим действием не удаляются.</p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={!repository.available || busy}
            onClick={async () => {
              if (!remove || deleting.current || !repository.available) return;
              deleting.current = true;
              setBusy(true);
              setError('');
              try {
                await repository.remove(remove);
                setRemove(null);
                setMessage('Объект удалён.');
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Не удалось удалить объект.');
              } finally {
                deleting.current = false;
                setBusy(false);
              }
            }}
          >
            {busy ? 'Удаление…' : 'Подтвердить удаление объекта'}
          </button>
          <button className="btn btn-quiet" disabled={busy} onClick={() => setRemove(null)}>
            Отмена
          </button>
        </div>
      </Modal>
    </section>
  );
}
function ProjectWorkflow({
  workflow,
  projects,
  repository,
  onCancel,
  onSaved,
}: {
  workflow: Workflow;
  projects: ManagedProject[];
  repository: ProjectRepository;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [target, setTarget] = useState(workflow.project?.id ?? 'new');
  const [original, setOriginal] = useState(workflow.project);
  const [fields, setFields] = useState<ProjectFields>(workflow.project ?? emptyProjectFields);
  const [plan, setPlan] = useState<WorkPlan | null>(
    workflow.project?.plan ? structuredClone(workflow.project.plan) : null,
  );
  const [step, setStep] = useState<'destination' | 'fields' | 'plan'>(
    workflow.kind === 'plan' && !workflow.project
      ? 'destination'
      : workflow.project && workflow.csv
        ? 'plan'
        : 'fields',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function save() {
    if (!repository.available || saving.current) return;
    setError('');
    const parsed = projectFieldsSchema.safeParse(fields);
    const stages = planSchema.safeParse(plan?.stages ?? []);
    if (!parsed.success || !stages.success || (plan && (!plan.name.trim() || plan.name.length > 200))) {
      setError('Проверьте поля объекта, название графика и этапы.');
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const preparedPlan = plan ? { name: plan.name.trim(), stages: stages.data } : null;
      if (original) await repository.update(original, parsed.data, preparedPlan);
      else await repository.create(parsed.data, preparedPlan);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить. Черновик оставлен в форме.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="project-editor stack">
      <h3 className="h-sec">{original ? 'Редактирование объекта' : 'Новый объект и график'}</h3>
      {step === 'destination' && (
        <>
          <label className="field">
            Объект для графика
            <select
              aria-label="Объект для графика"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="new">Добавить новый объект</option>
              {!repository.available && (
                <option disabled>Существующие объекты появятся после подключения API</option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="sub">
            Сначала выберите объект или заполните новую карточку, затем задайте этапы или загрузите CSV.
          </p>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                const selected = projects.find((p) => p.id === target);
                setOriginal(selected);
                setFields(selected ?? emptyProjectFields);
                setPlan(selected?.plan ? structuredClone(selected.plan) : null);
                setStep(selected ? 'plan' : 'fields');
              }}
            >
              Продолжить
            </button>
            <button className="btn btn-quiet" onClick={onCancel}>
              Отменить черновик
            </button>
          </div>
        </>
      )}
      {step === 'fields' && (
        <ProjectForm
          initial={fields}
          submitLabel="Продолжить к графику"
          onCancel={onCancel}
          onSave={(value) => {
            setFields(value);
            setStep('plan');
          }}
        />
      )}
      {step === 'plan' && (
        <>
          <p>
            <strong>{fields.name}</strong> · {fields.address}
          </p>
          <p className="sub">Застройщик: {fields.developer}</p>
          <fieldset disabled={busy} className="project-editor-fields stack">
            <button type="button" className="btn btn-quiet" onClick={() => setStep('fields')}>
              Изменить данные объекта
            </button>
            <PlanEditor plan={plan} onChange={setPlan} objectName={fields.name} startImport={workflow.csv} />
          </fieldset>
          {!repository.available && (
            <p className="inspection-notice">
              Сохранение недоступно до подключения API. Объект и график ещё не созданы на сервере.
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={!repository.available || busy}
              onClick={() => void save()}
            >
              {busy ? 'Сохранение…' : 'Сохранить объект и график'}
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={onCancel}>
              Отменить черновик
            </button>
          </div>
        </>
      )}
    </div>
  );
}
