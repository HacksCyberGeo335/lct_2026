import { useState } from 'react';
import { classes, type EquipmentClass, type Stage } from '../../domain/models';
import { resourcesOf } from '../../domain/plan';
import { defaultMapping, validateRows } from '../import/csv';
import { stageBranch } from './model';
export function StageForm({
  stage,
  stages,
  onSave,
  onCancel,
}: {
  stage?: Stage;
  stages: Stage[];
  onSave: (stage: Stage) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState({
    name: stage?.name ?? '',
    start: stage?.start ?? '',
    end: stage?.end ?? '',
    zone: stage?.zone ?? '',
    parent_id: stage?.parentId ?? '',
    work_id: stage?.workId ?? '',
    catalog_id: stage?.catalogId ?? '',
    policy: stage?.rulePolicy ?? 'required-only',
  });
  const [resources, setResources] = useState(() =>
    stage ? resourcesOf(stage).map((r) => ({ ...r, quantity: String(r.quantity) })) : [],
  );
  const [error, setError] = useState('');
  const excluded = stage ? stageBranch(stages, stage.id) : new Set<string>();
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        const row = {
          ...value,
          parent_id: '',
          id: stage?.id ?? crypto.randomUUID(),
          resources: resources.map((r) => `${r.equipment}:${r.quantity}`).join('|'),
        };
        const headers = Object.keys(row);
        const parsed = validateRows(
          { headers, rows: [Object.values(row)], lineNumbers: [1], headerLine: 1, error: null },
          defaultMapping(headers),
        );
        // Full hierarchy is validated when saving the entire plan, not a single child row.
        const errors = parsed.errors;
        if (errors.length) {
          setError(errors.map((issue) => issue.message).join(' '));
          return;
        }
        try {
          const next = parsed.stages[0];
          if (!next) throw new Error('Проверьте заполнение этапа.');
          onSave({
            ...next,
            parentId: value.parent_id || null,
            actualStart: stage?.actualStart ?? null,
            actualEnd: stage?.actualEnd ?? null,
            plan: stage?.plan ?? null,
            fact: stage?.fact ?? null,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Не удалось сохранить этап.');
        }
      }}
    >
      <label className="field">
        Название этапа *
        <input
          required
          maxLength={300}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <div className="project-form-grid">
        <label className="field">
          Начало *
          <input
            required
            type="date"
            value={value.start}
            onChange={(e) => setValue({ ...value, start: e.target.value })}
          />
        </label>
        <label className="field">
          Окончание *
          <input
            required
            type="date"
            value={value.end}
            onChange={(e) => setValue({ ...value, end: e.target.value })}
          />
        </label>
        <label className="field">
          Зона / участок
          <input
            maxLength={300}
            value={value.zone}
            onChange={(e) => setValue({ ...value, zone: e.target.value })}
          />
        </label>
        <label className="field">
          Родительский этап
          <select
            aria-label="Родительский этап"
            value={value.parent_id}
            onChange={(e) => setValue({ ...value, parent_id: e.target.value })}
          >
            <option value="">Самостоятельный этап</option>
            {stages
              .filter((s) => !excluded.has(s.id))
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <fieldset className="stack">
        <legend>Потребность в технике</legend>
        <p className="sub">
          Необязательно. Ресурсы задаются для конкретных работ, а не для сводных родительских этапов.
        </p>
        {resources.map((r, index) => (
          <div className="project-resource-row" key={index}>
            <label className="field">
              Техника
              <select
                aria-label={`Техника ${index + 1}`}
                value={r.equipment}
                onChange={(e) =>
                  setResources(
                    resources.map((item, i) =>
                      i === index ? { ...item, equipment: e.target.value as EquipmentClass } : item,
                    ),
                  )
                }
              >
                {Object.entries(classes).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Количество
              <input
                aria-label={`Количество ${index + 1}`}
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={r.quantity}
                onChange={(e) =>
                  setResources(
                    resources.map((item, i) => (i === index ? { ...item, quantity: e.target.value } : item)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="btn btn-quiet"
              aria-label={`Убрать ресурс ${index + 1}`}
              onClick={() => setResources(resources.filter((_, i) => i !== index))}
            >
              Убрать
            </button>
          </div>
        ))}
        <button
          className="btn btn-quiet"
          type="button"
          disabled={resources.length >= 9}
          onClick={() =>
            setResources([
              ...resources,
              {
                equipment: (Object.keys(classes).find((key) => !resources.some((r) => r.equipment === key)) ??
                  'exc') as EquipmentClass,
                quantity: '1',
              },
            ])
          }
        >
          Добавить технику
        </button>
      </fieldset>
      <details>
        <summary>Правило проверки и связь со справочником</summary>
        <div className="stack">
          <label className="field">
            Правило проверки
            <select
              value={value.policy}
              onChange={(e) => setValue({ ...value, policy: e.target.value as typeof value.policy })}
            >
              <option value="required-only">Проверять нехватку</option>
              <option value="required-and-unexpected">Проверять нехватку и лишние классы</option>
            </select>
          </label>
          <p className="sub">ID работы и версию справочника укажите вместе или оставьте пустыми.</p>
          <label className="field">
            ID работы справочника
            <input value={value.work_id} onChange={(e) => setValue({ ...value, work_id: e.target.value })} />
          </label>
          <label className="field">
            Версия справочника
            <input
              value={value.catalog_id}
              onChange={(e) => setValue({ ...value, catalog_id: e.target.value })}
            />
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="btn btn-primary" type="submit">
          Применить этап к черновику
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
