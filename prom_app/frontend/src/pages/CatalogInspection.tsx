import { CatalogManager } from '../features/catalog/CatalogManager';
import { useCatalogChoice } from '../features/catalog/CatalogProvider';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp, useFilters } from '../app/context';
import { useCatalog } from '../api/catalog';
import { demoExtension } from '../app/demoExtension';
import type { Catalog } from '../domain/catalog';
import type { Project, Stage } from '../domain/models';
import { editProfile, profileForStage } from '../domain/profileTransitions';
import { leafStages } from '../domain/plan';
import { emptyProfile, validateProfile, type CatalogProfile } from '../domain/catalogInspection';
import { useInspectionSession } from '../features/inspection/session';
import { WorkPicker } from '../features/catalog/WorkPicker';
import { WorkDetails } from '../features/catalog/WorkDetails';
import { RuleContext } from '../features/catalog/RuleContext';
import { ProfileStorage, readProfile } from '../features/catalog/ProfileStorage';
import { FrameWorkspace } from '../features/catalog/FrameWorkspace';
import { CatalogAssessment } from '../features/catalog/CatalogAssessment';
import { ImportPlan } from '../features/import/ImportPlan';
import { Modal } from '../shared/ui';

export function CatalogInspection({ project }: { project?: Project }) {
  const query = useCatalog(),
    { objectId } = useParams(),
    { mode } = useApp();
  const { custom } = useCatalogChoice();
  const activeCatalog = custom?.catalog ?? query.data;
  const id = project?.id ?? objectId ?? 'api-workspace';
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">{project?.name ?? 'Локальная проверка площадки'}</p>
        <h1 className="h-page">Снимки и работы</h1>
        <p className="meta">Выберите плановую работу, уточните условия и сопоставьте их с наблюдениями.</p>
      </header>
      <CatalogManager builtin={query.data} />
      {!custom && query.isPending && <p role="status">Загружаем и проверяем справочник…</p>}
      {!custom && query.isError && (
        <section className="sheet sheet-pad stack">
          <p role="alert">Не удалось открыть справочник. {query.error.message}</p>
          <button className="btn btn-primary" onClick={() => void query.refetch()}>
            Повторить загрузку
          </button>
        </section>
      )}
      {activeCatalog && (
        <Workspace
          key={mode + ':' + id + ':' + activeCatalog.id}
          objectId={id}
          catalog={activeCatalog}
          project={project}
        />
      )}
    </>
  );
}
function Workspace({
  catalog,
  project,
  objectId,
}: {
  catalog: Catalog;
  project?: Project;
  objectId: string;
}) {
  const { mode } = useApp(),
    { params, update } = useFilters();
  const { session, setProfile, setPlan, replace } = useInspectionSession(objectId);
  const stages =
    params.get('plan') === 'calendar' ? (project?.stages ?? []) : (session.plan ?? project?.stages ?? []);
  const [initial] = useState(() => {
    try {
      return {
        profile: session.profile
          ? validateProfile(session.profile, catalog, objectId)
          : readProfile(mode, objectId, catalog),
        error: '',
      };
    } catch {
      return {
        profile: null,
        error:
          'Сохранённый профиль не подходит этому объекту или версии справочника. Настройте и сохраните новый профиль либо импортируйте совместимый JSON.',
      };
    }
  });
  const [recoveryError, setRecoveryError] = useState(initial.error);
  const baseProfile =
    (session.profile?.catalogId === catalog.id ? session.profile : null) ??
    initial.profile ??
    emptyProfile(objectId, catalog.id);
  const stageId = params.get('stage');
  const profile = stageId
    ? profileForStage(
        baseProfile,
        stageId,
        stages.find((stage) => stage.id === stageId),
      )
    : baseProfile;
  function change(p: CatalogProfile) {
    setProfile(p);
    update({ stage: null });
  }
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const [frameRevision, setFrameRevision] = useState(0);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const selected = params.has('image')
    ? session.frames.find((f) => f.id === params.get('image'))
    : session.frames[0];
  const bound = stages.find((s) => s.id === profile.stageId);
  const bindingError =
    profile.planSource !== 'calendar'
      ? ''
      : !bound
        ? 'Связанная строка календаря недоступна. Выберите её заново.'
        : !leafStages(stages).includes(bound)
          ? 'Выбран сводный этап. Укажите конкретную операцию.'
          : bound.catalogId && bound.catalogId !== catalog.id
            ? 'Версия справочника в строке плана устарела. Требуется повторное сопоставление.'
            : bound.workId && bound.workId !== profile.workId
              ? 'Работа профиля не совпадает со строкой плана.'
              : bound.zone !== profile.zone || bound.start !== profile.start || bound.end !== profile.end
                ? 'План изменился. Выберите строку заново, чтобы обновить зону и период.'
                : '';
  function checkPlan(plan: Stage[]) {
    for (const s of plan)
      if (s.workId && (s.catalogId !== catalog.id || !catalog.works.has(s.workId)))
        throw new Error('Этап «' + s.name + '»: неизвестная работа или другая версия справочника.');
    setPlan(plan);
    change({ ...profile, planSource: 'calendar', stageId: '', kind: 'draft' });
    update({ plan: null, stage: null });
  }
  async function demo() {
    if (controller.current || !demoExtension) return;
    setConfirm(false);
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await demoExtension.loadInspectionExample(objectId, catalog, abort.signal);
      if (abort.signal.aborted) return;
      replace(data.frames, data.plan);
      change(data.profile);
      setFrameRevision((n) => n + 1);
      update({ image: data.frames[0].id, stage: null, plan: null });
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось загрузить пример.');
    } finally {
      if (!abort.signal.aborted) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="catalog-workspace stack">
      <section className="sheet sheet-pad stack">
        <div className="section-heading">
          <p>
            <b>Проверка по выбранному справочнику</b>
            <br />
            <span className="sub">
              {catalog.cards.length} работ · {catalog.detectors.size} классов детектора
            </span>
          </p>
          {demoExtension && (
            <button
              className="btn btn-primary"
              disabled={busy || snapshotBusy}
              onClick={() =>
                session.frames.length || profile.workId || session.plan ? setConfirm(true) : void demo()
              }
            >
              Открыть пример со справочником
            </button>
          )}
        </div>
        <p className="sub">
          Выберите работу и уточните условия, влияющие на технику. Справочник не заменяет проектную
          документацию.
        </p>
        <p>
          {profile.kind === 'demo'
            ? 'Синтетический пример: котлован со складированием грунта. Можно менять метод и сравнивать результат.'
            : 'Локальный профиль проверки. Настройки задаёт оператор; это не утверждённый ППР.'}
        </p>
        {recoveryError && <p role="alert">{recoveryError}</p>}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Открываем демонстрационные снимки…</p>}
      </section>
      <fieldset className="catalog-body stack" disabled={busy}>
        <section className="sheet sheet-pad stack">
          <WorkPicker
            catalog={catalog}
            selected={profile.workId}
            onSelect={(id) => change(editProfile(profile, { workId: id }))}
          />
          {!profile.workId && (
            <p>
              Плановую работу выбирают из документации. Наличие машины в кадре само по себе не определяет
              работу.
            </p>
          )}
          <WorkDetails catalog={catalog} workId={profile.workId} />
        </section>
        <section className="sheet sheet-pad stack">
          <RuleContext catalog={catalog} profile={profile} onChange={change} stages={leafStages(stages)} />
          {bindingError && <p role="alert">{bindingError}</p>}
          <details>
            <summary>Загрузить календарный план CSV</summary>
            <p>
              Поля work_id и catalog_id связывают строку с работой. В старом файле работу можно выбрать
              вручную. Количественные ресурсы используются только в отдельном режиме ресурсного плана.
            </p>
            <ImportPlan objectId={objectId} onApply={checkPlan} disabled={busy} />
            <a className="btn-link" href="/catalog/plan-example.csv" download>
              Скачать пример CSV со связью со справочником
            </a>
          </details>
          <ProfileStorage
            catalog={catalog}
            profile={profile}
            mode={mode}
            onApply={change}
            onSaved={() => setRecoveryError('')}
          />
        </section>
        <FrameWorkspace
          key={frameRevision}
          objectId={objectId}
          threshold={profile.confidence}
          disabled={busy}
          onBusyChange={setSnapshotBusy}
        />
        <CatalogAssessment
          catalog={catalog}
          profile={profile}
          frames={session.frames}
          selected={selected}
          bindingError={bindingError}
        />
      </fieldset>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Открыть пример со справочником?"
        description="Текущие снимки, настройки проверки и план сеанса будут заменены синтетическим примером. Сохранённый профиль и календарь объекта останутся."
      >
        <button className="btn btn-primary" onClick={() => void demo()}>
          Открыть демонстрационный набор
        </button>
      </Modal>
    </div>
  );
}
