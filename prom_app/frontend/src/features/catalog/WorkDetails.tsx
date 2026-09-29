import { safeSourceUrl, type Catalog } from '../../domain/catalog';
import { detectorLabel } from '../../domain/detectorClasses';
export function SourceLink({ url, title }: { url: string; title: string }) {
  const safe = safeSourceUrl(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer">
      {title} ↗
    </a>
  ) : (
    <span>{title}</span>
  );
}
export function WorkDetails({ catalog, workId }: { catalog: Catalog; workId: string }) {
  const card = catalog.cardsById.get(workId),
    work = catalog.works.get(workId);
  if (!card || !work) return null;
  const groups = [...work.required_equipment, ...work.conditional_required_equipment];
  const sources = [...new Set(groups.flatMap((g) => g.source_ids))];
  return (
    <div className="catalog-details stack">
      <h2 className="h-sec">{card.canonical_work_name}</h2>
      <p className="sub">{catalog.categories[card.macro_stage]}</p>
      {card.row_kind === 'AGGREGATE' ? (
        <p>Это сводный раздел. Для проверки выберите конкретную работу.</p>
      ) : (
        <>
          <h3>Техника для проверки</h3>
          {groups.length ? (
            groups.map((g) => (
              <div className="catalog-row" key={g.requirement_id}>
                <strong>{g.equipment_name_ru}</strong>
                <p>{g.one_of.map((id) => catalog.equipmentById.get(id)?.name_ru).join(' или ')}</p>
                <p className="sub">
                  {g.phase} · {g.condition}
                </p>
              </div>
            ))
          ) : (
            <p>
              Обязательная техника не определена. По одному отсутствию машин нельзя сделать вывод о
              невыполнении работы.
            </p>
          )}
          {!!card.positive_visual_signs.length && (
            <>
              <h3>Что видно на снимках</h3>
              <ul>
                {card.positive_visual_signs.map((sign, index) => (
                  <li key={index}>{sign}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <details>
        <summary>Дополнительная информация и источники</summary>
        <p>{card.observability_note}</p>
        <p>Типы объектов: {card.applicable_object_types.join(', ') || 'не указаны'}.</p>
        <p>
          Классы распознавания:{' '}
          {[
            ...new Set(
              groups.flatMap((g) =>
                g.one_of.flatMap((id) => catalog.equipmentById.get(id)?.detector_classes ?? []),
              ),
            ),
          ]
            .map((id) => detectorLabel(id))
            .join(', ') || 'не заданы'}
          .
        </p>
        <p>
          Возможная, но не обязательная техника:{' '}
          {work.possible_equipment.map((item) => item.equipment_name_ru).join(', ') || 'не указана'}.
        </p>
        {sources.map((id) => {
          const source = catalog.sources.get(id);
          return source ? (
            <p key={id}>
              <SourceLink url={source.url} title={source.title} />
            </p>
          ) : null;
        })}
        <p className="sub">
          Числовые оценки наблюдаемости, примерные длительности и внутренние идентификаторы не используются
          как доказательство выполнения работ. Исходные данные сохраняются в скачиваемом справочнике.
        </p>
      </details>
    </div>
  );
}
