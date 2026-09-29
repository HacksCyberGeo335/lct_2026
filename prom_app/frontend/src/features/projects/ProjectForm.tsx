import { useState } from 'react';
import { emptyProjectFields, projectFieldsSchema, type ProjectFields } from './model';
export function ProjectForm({
  initial = emptyProjectFields,
  onSave,
  onCancel,
  submitLabel = 'Сохранить объект',
}: {
  initial?: ProjectFields;
  onSave: (fields: ProjectFields) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState<ProjectFields>(() => ({ ...initial }));
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const fields: [keyof ProjectFields, string, boolean][] = [
    ['name', 'Название объекта', true],
    ['address', 'Адрес строительства', true],
    ['developer', 'Застройщик / заказчик', true],
    ['district', 'Округ / район', false],
    ['permit', 'Номер разрешения на строительство', false],
    ['programme', 'Тип объекта / программа', false],
    ['contractor', 'Генеральный подрядчик', false],
    ['contact', 'Ответственный / контакты', false],
  ];
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        setIssues({});
        const parsed = projectFieldsSchema.safeParse(value);
        if (!parsed.success) {
          const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
          setIssues(errors);
          e.currentTarget
            .querySelector<HTMLInputElement>('[name="' + String(parsed.error.issues[0].path[0]) + '"]')
            ?.focus();
          return;
        }
        try {
          onSave(parsed.data);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Не удалось сохранить объект.');
        }
      }}
    >
      <p className="sub">
        Поля со звёздочкой обязательны. Данные остаются черновиком формы до сохранения на сервере.
      </p>
      <div className="project-form-grid">
        {fields.map(([key, label, required]) => (
          <label className="field" key={key}>
            {label}
            {required ? ' *' : ''}
            <input
              name={key}
              aria-invalid={!!issues[key]}
              aria-describedby={issues[key] ? 'project-error-' + key : undefined}
              required={required}
              maxLength={300}
              value={value[key]}
              onChange={(e) => {
                setValue({ ...value, [key]: e.target.value });
                setIssues({ ...issues, [key]: '' });
              }}
            />
            {issues[key] && (
              <span id={'project-error-' + key} className="error-text" role="alert">
                {issues[key]}
              </span>
            )}
          </label>
        ))}
      </div>
      <label className="field">
        Примечания
        <textarea
          rows={3}
          maxLength={4000}
          value={value.notes}
          onChange={(e) => setValue({ ...value, notes: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="btn btn-primary" type="submit">
          {submitLabel}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
