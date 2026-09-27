import { useFilters } from '../app/context';
import type { Project } from '../domain/models';
import { demoExtension } from '../app/demoExtension';
import { CatalogInspection } from './CatalogInspection';
export function Inspection({ project }: { project?: Project }) {
  const { params, update } = useFilters();
  const legacy = !!demoExtension && params.get('rules') === 'legacy';
  return (
    <>
      {demoExtension && (
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
      )}
      {legacy && demoExtension ? (
        <>
          <p className="inspection-notice">
            Отдельный демонстрационный алгоритм: сравнение чисел из ресурсного плана. Требования нового
            справочника здесь не применяются.
          </p>
          <demoExtension.LegacyInspection project={project} />
        </>
      ) : (
        <CatalogInspection project={project} />
      )}
    </>
  );
}
