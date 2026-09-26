import { requirementStatuses, safeSourceUrl, type Catalog } from '../../domain/catalog';
import { detectorLabel } from '../../domain/detectorClasses';
export function SourceLink({ url, title }: { url: string; title: string }) {
  const safe = safeSourceUrl(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer">
      {title} ↗
    </a>
  ) : (
    <span>{title} (ссылка недоступна)</span>
  );
}
export function WorkDetails({ catalog, workId }: { catalog: Catalog; workId: string }) {
  const card = catalog.cardsById.get(workId),
    work = catalog.works.get(workId),
    duration = catalog.durationWorks.get(workId);
  if (!card || !work) return null;
  const sourceIds = [
    ...new Set(
      [
        ...work.required_equipment,
        ...work.conditional_required_equipment,
        ...work.possible_equipment,
      ].flatMap((g) => g.source_ids),
    ),
  ];
  return (
    <div className="catalog-details">
      <div className="section-heading">
        <h2 className="h-sec">{card.canonical_work_name}</h2>
        <span className="catalog-tag">{card.id}</span>
      </div>
      <p>{requirementStatuses[work.requirement_status]}</p>
      <p className="sub">
        {card.source.context.join(' / ')} · {catalog.categories[card.macro_stage]}
      </p>
      <details>
        <summary>Признаки и применимость</summary>
        <p>
          Наблюдаемость: <b>{card.external_camera_observability.toLocaleString('ru-RU')} из 1</b> — экспертная
          оценка, не вероятность выполнения.
        </p>
        <p>{card.observability_note || 'Дополнительное пояснение не задано.'}</p>
        <ul>
          {card.positive_visual_signs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {!card.positive_visual_signs.length && <p>Надёжные визуальные признаки не заданы.</p>}
        <p>Отмеченные типы объектов: {card.applicable_object_types.join(', ') || 'не указаны'}.</p>
      </details>
      <details>
        <summary>Возможная техника · {work.possible_equipment.length}</summary>
        <p>
          Эти средства не требуются одновременно. Список открытый; отсутствие машины в нём не означает
          нарушение.
        </p>
        {work.possible_equipment.map((r) => (
          <div className="catalog-row" key={r.equipment_id}>
            <strong>{r.equipment_name_ru}</strong> <span className="sub">{r.equipment_name_en}</span>
            <p>{r.condition}</p>
            <small>{r.evidence_level}</small>
            <p className="sub">
              Тип оборудования: {r.equipment_id} · {catalog.equipmentById.get(r.equipment_id)?.kind}.
              Наблюдаемость: {catalog.equipmentById.get(r.equipment_id)?.cctv_visibility}. Классы детектора:{' '}
              {catalog.equipmentById.get(r.equipment_id)?.detector_classes.map(detectorLabel).join(', ') ||
                'не заданы'}
              .
            </p>
          </div>
        ))}
      </details>
      <details>
        <summary>
          Длительности и ограничения · {duration?.benchmarks.length || 'нет числового ориентира'}
        </summary>
        <p>Это примеры, а не календарный план. Они не задают автоматически даты или число дней отставания.</p>
        {!duration?.benchmarks.length && (
          <p>
            <b>Числовой ориентир не подтверждён.</b>
          </p>
        )}
        {duration?.benchmarks.map((link) => {
          const b = catalog.benchmarks.get(link.benchmark_id)!,
            source = catalog.durationSources.get(b.source_id)!;
          return (
            <article key={b.id} className="catalog-row">
              <h3>{b.title}</h3>
              <p>
                <b>
                  {b.value.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} {b.unit}
                </b>{' '}
                · {b.value_kind}
              </p>
              <p>{link.coverage}</p>
              <p>{b.basis}</p>
              <dl className="detail-grid">
                <div>
                  <dt>Диапазон источника</dt>
                  <dd>
                    {b.low ?? 'Не задан'} — {b.high ?? 'Не задан'}
                  </dd>
                </div>
                <div>
                  <dt>Объём / технология</dt>
                  <dd>{b.scope}</dd>
                </div>
                <div>
                  <dt>Ресурсы</dt>
                  <dd>{b.resources}</dd>
                </div>
                <div>
                  <dt>Расчёт</dt>
                  <dd>{b.formula}</dd>
                </div>
              </dl>
              <p>{b.limits}</p>
              <SourceLink url={source.url} title={source.title} />
              <p className="sub">
                {source.locator} · способ проверки: {source.access}
              </p>
            </article>
          );
        })}
        <p>{duration?.review}</p>
        <p>Для оценки всего этапа: {duration?.missing_inputs}</p>
      </details>
      <details>
        <summary>Источники, исходное название и зависимости</summary>
        <p>
          Исходное название: {card.work_name} · ячейка {card.source.cell}.
        </p>
        <p>
          Проверка 18.09.2026. reviewed означает документарную проверку, а не утверждённый ППР. Возможности
          камеры и применимость правил требуют настройки объекта.
        </p>
        {work.review_notes.map((s) => (
          <p key={s}>{s}</p>
        ))}
        {sourceIds.map((id) => {
          const s = catalog.sources.get(id)!;
          return (
            <div className="catalog-row" key={id}>
              <SourceLink url={s.url} title={s.title} />
              <p>{s.supports}</p>
              <p className="sub">
                {s.locator} · {s.access} · {s.checked_on}
              </p>
            </div>
          );
        })}
        {!sourceIds.length && (
          <p>Связанные технические источники не указаны; сведения остаются экспертными предположениями.</p>
        )}
        {(['predecessor', 'successor'] as const).map((key) => (
          <div key={key}>
            <h3>{key === 'predecessor' ? 'Предшествующие работы' : 'Последующие работы'}</h3>
            {card[key] === 'UNKNOWN' ? (
              <p>Обоснованные связи не установлены.</p>
            ) : (
              <ul>
                {card[key].map((l, i) => (
                  <li key={i}>
                    {catalog.cardsById.get(l.work_id)?.canonical_work_name} ({l.work_id}): {l.condition}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <p className="sub">
          Граф неполный. Контекст раздела и порядок строк не являются календарной последовательностью.
        </p>
      </details>
    </div>
  );
}
