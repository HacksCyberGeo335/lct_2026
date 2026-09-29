import { editProfile, profileForStage } from '../../domain/profileTransitions';
import { allRequirements, type CatalogProfile } from '../../domain/catalogInspection';
import type { Catalog } from '../../domain/catalog';
import type { Stage } from '../../domain/models';
import { conditionName, valueName } from './conditionLabels';
import { detectorLabel } from '../../domain/detectorClasses';
export function RuleContext({
  catalog,
  profile: p,
  onChange,
  stages,
}: {
  catalog: Catalog;
  profile: CatalogProfile;
  onChange: (p: CatalogProfile) => void;
  stages: Stage[];
}) {
  const patch = (value: Partial<CatalogProfile>) => onChange(editProfile(p, value));
  const groups = allRequirements(catalog, p.workId);
  const phases = [...new Set(groups.map((g) => g.phase))];
  const keys = [...new Set(groups.flatMap((g) => Object.keys(g.when)))];
  return (
    <div className="catalog-context">
      <h2 className="h-sec">План и условия проверки</h2>
      <p className="sub">План задаётся независимо от снимка. Автоматический анализ пока недоступен.</p>
      <div className="catalog-grid">
        <label className="field">
          Источник плановой работы
          <select
            value={p.planSource}
            onChange={(e) =>
              patch({ planSource: e.target.value as CatalogProfile['planSource'], stageId: '' })
            }
          >
            <option value="operator">Задано оператором</option>
            <option value="calendar">Строка календарного плана</option>
          </select>
        </label>
        {p.planSource === 'calendar' && (
          <label className="field">
            Строка календаря
            <select
              value={p.stageId}
              onChange={(e) => {
                const stage = stages.find((s) => s.id === e.target.value);
                if (stage) onChange(profileForStage(p, stage.id, stage));
                else patch({ stageId: '' });
              }}
            >
              <option value="">Выберите строку</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.zone}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Зона работы
          <input
            value={p.zone}
            maxLength={120}
            disabled={p.planSource === 'calendar'}
            onChange={(e) => patch({ zone: e.target.value })}
          />
        </label>
        <label className="field">
          Начало плана
          <input
            type="date"
            value={p.start}
            disabled={p.planSource === 'calendar'}
            onChange={(e) => patch({ start: e.target.value })}
          />
        </label>
        <label className="field">
          Окончание плана
          <input
            type="date"
            value={p.end}
            disabled={p.planSource === 'calendar'}
            onChange={(e) => patch({ end: e.target.value })}
            aria-describedby={p.start && p.end && p.start > p.end ? 'catalog-date-error' : undefined}
          />
        </label>
      </div>
      {p.start && p.end && p.start > p.end && (
        <p id="catalog-date-error" role="alert">
          Начало плана позже окончания.
        </p>
      )}
      <p className="sub">
        Без дат доступно сопоставление с выбранной операцией; вывод о соблюдении календарного срока не
        формируется.
      </p>
      {!!keys.length && (
        <details>
          <summary>Условия, меняющие требования к технике</summary>
          <p className="sub">
            Заполняйте только применимые условия. Неизвестные условия не считаются подтверждёнными.
          </p>
          <div className="catalog-grid">
            {keys.map((key) => (
              <label className="field" key={key}>
                {conditionName(key)}
                <select
                  value={p.conditions[key] ?? ''}
                  onChange={(e) => patch({ conditions: { ...p.conditions, [key]: e.target.value } })}
                >
                  <option value="">Неизвестно / не задано</option>
                  {[...new Set(groups.flatMap((g) => (g.when[key] ? [g.when[key]] : [])))].map((v) => (
                    <option key={v} value={v}>
                      {valueName(v)}
                    </option>
                  ))}
                  <option value="other">
                    {key === 'soil_transport'
                      ? 'Складирование на площадке / другой способ'
                      : valueName('other')}
                  </option>
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
      {!!phases.length && (
        <fieldset>
          <legend>Активные фазы</legend>
          {phases.map((phase) => (
            <label className="check" key={phase}>
              <input
                type="checkbox"
                checked={p.phases.includes(phase)}
                onChange={(e) =>
                  patch({
                    phases: e.target.checked ? [...p.phases, phase] : p.phases.filter((v) => v !== phase),
                  })
                }
              />
              {phase}
            </label>
          ))}
        </fieldset>
      )}
      {!!groups.length && (
        <details>
          <summary>Допустимые альтернативы для выбранной технологии</summary>
          <p>
            Внутри группы достаточно одной подходящей альтернативы. Список не исчерпывающий; выбор не
            подтверждает инженерную пригодность.
          </p>
          {groups.map((g) => (
            <fieldset key={g.requirement_id}>
              <legend>
                {g.equipment_name_ru} · {g.phase}
              </legend>
              {g.one_of.map((id) => (
                <label className="check" key={id}>
                  <input
                    type="checkbox"
                    checked={(p.alternatives[g.requirement_id] ?? []).includes(id)}
                    onChange={(e) =>
                      patch({
                        alternatives: {
                          ...p.alternatives,
                          [g.requirement_id]: e.target.checked
                            ? [...(p.alternatives[g.requirement_id] ?? []), id]
                            : (p.alternatives[g.requirement_id] ?? []).filter((v) => v !== id),
                        },
                      })
                    }
                  />
                  {catalog.equipmentById.get(id)?.name_ru}
                </label>
              ))}
            </fieldset>
          ))}
        </details>
      )}
      <details>
        <summary>Камера и возможности модели</summary>
        <div className="catalog-grid">
          {p.observationMode === 'single' && (
            <label className="field">
              ID камеры
              <input
                value={p.cameraId}
                onChange={(e) => patch({ cameraId: e.target.value, coverage: 'unknown' })}
              />
            </label>
          )}
          <label className="field">
            Источник распознавания
            <input
              value={p.modelId}
              maxLength={120}
              onChange={(e) => patch({ modelId: e.target.value, detectorValidated: false })}
            />
          </label>
          <label className="field">
            Обзор рабочей зоны
            <select
              value={p.coverage}
              onChange={(e) => patch({ coverage: e.target.value as CatalogProfile['coverage'] })}
            >
              <option value="unknown">Не подтверждён</option>
              <option value="adequate">Достаточный для выбранной проверки</option>
              <option value="occluded">Зона закрыта / не видна</option>
            </select>
          </label>
          <label className="field">
            Порог уверенности детекций
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={p.confidence}
              onChange={(e) => {
                if (e.target.value !== '' && +e.target.value >= 0 && +e.target.value <= 1)
                  patch({ confidence: +e.target.value, detectorValidated: false });
              }}
            />
          </label>
        </div>
        <p className="sub">
          0,5 — начальное значение для локальной проверки, не гарантия точности. Классы ниже — справочный
          словарь, выберите только поддерживаемые вашей моделью.
        </p>
        <fieldset className="catalog-class-list">
          <legend>Поддерживаемые классы модели</legend>
          {[...catalog.detectors.keys()].map((id) => (
            <label className="check" key={id}>
              <input
                type="checkbox"
                checked={p.supportedClasses.includes(id)}
                onChange={(e) =>
                  patch({
                    supportedClasses: e.target.checked
                      ? [...p.supportedClasses, id]
                      : p.supportedClasses.filter((v) => v !== id),
                    detectorValidated: false,
                  })
                }
              />
              {detectorLabel(id)}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            checked={p.detectorValidated}
            onChange={(e) => patch({ detectorValidated: e.target.checked })}
          />
          Возможности модели и выбранный порог проверены для этого сценария
        </label>
      </details>
      <details>
        <summary>Один снимок или интервал наблюдения</summary>
        <label className="field">
          Режим наблюдения
          <select
            value={p.observationMode}
            onChange={(e) => patch({ observationMode: e.target.value as CatalogProfile['observationMode'] })}
          >
            <option value="single">Выбранный снимок</option>
            <option value="window">Интервал по одной камере</option>
          </select>
        </label>
        {p.observationMode === 'window' && (
          <div className="catalog-grid">
            <label className="field">
              ID камеры
              <input
                value={p.cameraId}
                maxLength={120}
                onChange={(e) => patch({ cameraId: e.target.value, coverage: 'unknown' })}
              />
            </label>
            <label className="field">
              Начало интервала · Москва
              <input
                type="datetime-local"
                value={p.windowStart}
                onChange={(e) => patch({ windowStart: e.target.value })}
              />
            </label>
            <label className="field">
              Конец интервала · Москва
              <input
                type="datetime-local"
                value={p.windowEnd}
                onChange={(e) => patch({ windowEnd: e.target.value })}
              />
            </label>
            <label className="field">
              Минимум моментов наблюдения
              <input
                type="number"
                min="2"
                max="50"
                value={p.minFrames ?? ''}
                onChange={(e) => patch({ minFrames: e.target.value ? +e.target.value : null })}
              />
            </label>
            <label className="field">
              Максимальный перерыв · минуты
              <input
                type="number"
                min="0.1"
                max="10080"
                step="0.1"
                value={p.maxGapMinutes ?? ''}
                onChange={(e) => patch({ maxGapMinutes: e.target.value ? +e.target.value : null })}
              />
            </label>
          </div>
        )}
        <p className="sub">
          Порогов времени в справочнике нет. Они задаются для конкретного сценария. Машины на разных снимках
          не складываются.
        </p>
      </details>
    </div>
  );
}
