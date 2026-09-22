import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp, useFilters } from '../app/context';
import { useCatalog } from '../api/catalog';
import { loadInspectionDemo } from '../api/inspectionDemo';
import type { Catalog } from '../domain/catalog';
import type { Project, Stage } from '../domain/models';
import { leafStages } from '../domain/plan';
import {
  allRequirements,
  emptyProfile,
  validateProfile,
  type CatalogProfile,
} from '../domain/catalogInspection';
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
  const id = project?.id ?? objectId ?? 'api-workspace';
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">{project?.name ?? 'Локальная проверка площадки'}</p>
        <h1 className="h-page">Снимки и работы</h1>
        <p className="meta">Выберите плановую работу, уточните условия и сопоставьте их с наблюдениями.</p>
      </header>
      {query.isPending && <p role="status">Загружаем и проверяем справочник…</p>}
      {query.isError && (
        <section className="sheet sheet-pad stack">
          <p role="alert">Не удалось открыть справочник. {query.error.message}</p>
          <button className="btn btn-primary" onClick={() => void query.refetch()}>
            Повторить загрузку
          </button>
        </section>
      )}
      {query.data && <Workspace key={mode + ':' + id} objectId={id} catalog={query.data} project={project} />}
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
  const [fallback, setFallback] = useState(() => {
    const p = initial.profile ?? emptyProfile(objectId, catalog.id);
    const stage = stages.find((s) => s.id === params.get('stage'));
    return stage
      ? {
          ...p,
          planSource: 'calendar' as const,
          stageId: stage.id,
          zone: stage.zone,
          start: stage.start,
          end: stage.end,
          workId: stage.workId ?? '',
          phases: [],
          conditions: {},
          alternatives: {},
        }
      : p;
  });
  const profile = session.profile && !params.has('stage') ? session.profile : fallback;
  function change(p: CatalogProfile) {
    setFallback(p);
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
    if (controller.current) return;
    setConfirm(false);
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await loadInspectionDemo(abort.signal);
      if (abort.signal.aborted) return;
      const p = emptyProfile(objectId, catalog.id),
        groups = allRequirements(catalog, 'work_047');
      const next: CatalogProfile = {
        ...p,
        workId: 'work_047',
        kind: 'demo',
        zone: 'А',
        start: '2026-08-01',
        end: '2026-08-31',
        phases: groups.map((g) => g.phase),
        conditions: { excavation_method: 'excavator', soil_transport: 'other' },
        alternatives: Object.fromEntries(groups.map((g) => [g.requirement_id, [g.one_of[0]]])),
        cameraId: '1',
        modelId: data.frames[0].result.model,
        coverage: 'adequate',
        detectorValidated: true,
        supportedClasses: ['excavator', 'dump_truck', 'crane'],
      };
      replace(data.frames, data.plan);
      change(next);
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
            <b>Справочник · 18 сентября 2026</b>
            <br />
            <span className="sub">377 работ · 127 видов техники · 18 классов детектора</span>
          </p>
          <button
            className="btn btn-primary"
            disabled={busy || snapshotBusy}
            onClick={() =>
              session.frames.length || profile.workId || session.plan ? setConfirm(true) : void demo()
            }
          >
            Открыть пример со справочником
          </button>
        </div>
        <p className="sub">
          Карточки 3.1-reviewed · техника 1.1 · длительности 1.0. Источники проверены составителем;
          применимость к объекту требует уточнения.
        </p>
        <p>
          {profile.kind === 'demo'
            ? 'Синтетический пример: котлован со складированием грунта. Можно менять метод и сравнивать результат.'
            : 'Локальный профиль проверки. Настройки задаёт оператор; это не утверждённый ППР.'}
        </p>
        {initial.error && <p role="alert">{initial.error}</p>}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Открываем демонстрационные снимки…</p>}
      </section>
      <fieldset className="catalog-body stack" disabled={busy}>
        <section className="sheet sheet-pad stack">
          <WorkPicker
            key={profile.workId}
            catalog={catalog}
            selected={profile.workId}
            onSelect={(id) =>
              change({ ...profile, workId: id, kind: 'draft', phases: [], conditions: {}, alternatives: {} })
            }
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
          <ProfileStorage catalog={catalog} profile={profile} mode={mode} onApply={change} />
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
