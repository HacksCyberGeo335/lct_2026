import { useFilters } from '../../app/context';
import { downloadJson } from '../../api/analysisResult';
import type { Catalog } from '../../domain/catalog';
import { evaluateCatalog, groupLabels, type CatalogProfile } from '../../domain/catalogInspection';
import type { InspectionFrame } from '../../domain/inspection';
import { detectorLabel, detectorAdapterVersion } from '../../domain/detectorClasses';
import { SourceLink } from './WorkDetails';
export function CatalogAssessment({
  catalog,
  profile,
  frames,
  selected,
  bindingError,
}: {
  catalog: Catalog;
  profile: CatalogProfile;
  frames: InspectionFrame[];
  selected?: InspectionFrame;
  bindingError: string;
}) {
  const { update } = useFilters();
  const result = evaluateCatalog(catalog, profile, frames, selected, bindingError);
  const card = catalog.cardsById.get(profile.workId);
  return (
    <section className="sheet sheet-pad stack catalog-assessment" aria-label="Сопоставление со справочником">
      <div className="section-heading">
        <h2 className="h-sec">Что видно по выбранной работе</h2>
        <span className="catalog-tag">Автотревоги отключены</span>
      </div>
      <p>{result.reason}</p>
      <p className="sub">
        Камера показывает внешний вид техники. Функция, оснастка, качество работ и физическая готовность по
        этому сравнению не подтверждаются.
      </p>
      {profile.observationMode === 'window' && (
        <p>
          Интервал: {profile.windowStart || 'не задан'} — {profile.windowEnd || 'не задан'} · Москва. Камера:{' '}
          {profile.cameraId || 'не задана'}, зона: {profile.zone || 'не задана'}. Подходящих снимков:{' '}
          {result.observations.length}. Достаточность наблюдений:{' '}
          {result.issues.length
            ? 'не подтверждена'
            : 'локальные критерии покрытия выполнены; тревоги всё равно отключены'}
          .
        </p>
      )}
      {card?.row_kind === 'AGGREGATE' && (
        <p>
          Это сводный раздел. Выберите конкретную операцию; требования подэтапов автоматически не
          объединяются.
        </p>
      )}
      {!!result.issues.length && (
        <div className="catalog-issues" role="status">
          <strong>Для проверки ещё требуется</strong>
          <ul>
            {result.issues.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {result.groups.map((r) => (
        <article key={r.group.requirement_id} className="catalog-group" data-state={r.state}>
          <div className="section-heading">
            <h3>{r.group.equipment_name_ru}</h3>
            <strong>{groupLabels[r.state]}</strong>
          </div>
          <p className="sub">
            {r.group.phase} · {r.group.requirement_id}
          </p>
          <p>{r.explanation}</p>
          {!!r.evidenceIds.length && (
            <div className="actions" aria-label={'Наблюдения: ' + r.group.requirement_id}>
              {r.evidenceIds.map((id) => (
                <button key={id} className="btn-link" onClick={() => update({ image: id })}>
                  {frames.find((f) => f.id === id)?.name} →
                </button>
              ))}
            </div>
          )}
          <details>
            <summary>Основание и ограничения требования</summary>
            <p>{r.group.condition}</p>
            <p>{r.group.rationale}</p>
            <p>Уровень обоснования: {r.group.evidence_level}</p>
            <p>
              Альтернативы: {r.group.one_of.map((id) => catalog.equipmentById.get(id)?.name_ru).join(' / ')}.
            </p>
            <p>
              Каждая группа проверяется отдельно. Внутри группы действует «или». Одна машина может выполнять
              несколько функций. Количества машин из этого справочника не выводятся.
            </p>
            {r.group.source_ids.map((id) => {
              const s = catalog.sources.get(id)!;
              return (
                <p key={id}>
                  <SourceLink url={s.url} title={s.title} />
                </p>
              );
            })}
          </details>
        </article>
      ))}
      {card && !result.groups.length && card.row_kind !== 'AGGREGATE' && (
        <p>
          Для этой работы нет формализованных групп требований. Это не означает, что работа завершена или
          нарушений нет.
        </p>
      )}
      {!!result.unlisted.length && (
        <p>
          Другие наблюдаемые классы: {result.unlisted.map(detectorLabel).join(', ')}. Открытый справочник не
          позволяет считать их нарушением.
        </p>
      )}
      <button
        className="btn btn-quiet"
        disabled={!card}
        onClick={() =>
          downloadJson(
            {
              version: 1,
              generatedAt: new Date().toISOString(),
              catalogId: catalog.id,
              detectorAdapterVersion,
              profile,
              automaticAbsenceAlertEnabled: false,
              issues: result.issues,
              reason: result.reason,
              groups: result.groups.map((g) => ({
                requirementId: g.group.requirement_id,
                state: g.state,
                explanation: g.explanation,
                evidenceIds: g.evidenceIds,
                sourceIds: g.group.source_ids,
              })),
              unlistedClasses: result.unlisted,
              observations: result.observations.map((f) => ({
                id: f.id,
                origin: f.origin,
                resultSource: f.resultSource,
                result: f.result,
              })),
            },
            'catalog-observations-' + profile.workId + '.json',
          )
        }
      >
        Скачать объяснение проверки
      </button>
    </section>
  );
}
