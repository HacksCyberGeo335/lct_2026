import { useFilters } from '../app/context';
import type { Project } from '../domain/models';
import { LegacyInspection } from './LegacyInspection';
import { CatalogInspection } from './CatalogInspection';
export function Inspection({ project }: { project?: Project }) {
  const { params, update } = useFilters();
  const legacy = params.get('rules') === 'legacy';
  return (
    <>
      <div className="actions inspection-modes" role="group" aria-label="Метод проверки">
        <button
          className="btn btn-quiet"
          aria-pressed={!legacy}
          onClick={() => update({ rules: null, stage: null })}
        >
          По справочнику работ
        </button>
        <button
          className="btn btn-quiet"
          aria-pressed={legacy}
          onClick={() => update({ rules: 'legacy', stage: null })}
        >
          По ресурсному плану · демо
        </button>
      </div>
      {legacy ? (
        <>
          <p className="inspection-notice">
            Отдельный демонстрационный алгоритм: сравнение чисел из ресурсного плана. Требования нового
            справочника здесь не применяются.
          </p>
          <LegacyInspection project={project} />
        </>
      ) : (
        <CatalogInspection project={project} />
      )}
    </>
  );
}
