import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../app/context';
import { source, resetDemo } from '../api/source';
import type { Project, Settings as SettingsModel } from '../domain/models';
import { ObjectHeader } from '../shared/ObjectHeader';
import { Modal, Notice, QueryState } from '../shared/ui';
export function Settings({ project }: { project: Project }) {
  const { mode, clearRecordings } = useApp(),
    client = useQueryClient(),
    [reset, setReset] = useState(false),
    [message, setMessage] = useState('');
  const key = [mode, 'settings', project.id];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => source(mode).settings(project.id, signal),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (value: SettingsModel) => source(mode).saveSettings(project.id, value),
    onSuccess: (value) => {
      client.setQueryData(key, value);
      setMessage('Сохранено в этом браузере для выбранного демообъекта.');
    },
  });
  async function resetAll() {
    try {
      resetDemo();
      clearRecordings();
      await client.invalidateQueries({ queryKey: ['demo'] });
      setReset(false);
      setMessage('Демосостояние сброшено.');
    } catch {
      setMessage('Не удалось сбросить локальное хранилище.');
    }
  }
  const settings: [keyof SettingsModel, string, string][] = [
    ['weekly', 'Сводка о ходе строительства', 'Демонстрация еженедельной сводки. Письма не отправляются.'],
    ['deviations', 'Оповещения при риске срыва этапа', 'Сохраняется только предпочтение для этого объекта.'],
    [
      'cameras',
      'Уведомления о недоступности камеры',
      'Демонстрация настройки. SMS и сообщения не отправляются.',
    ],
  ];
  return (
    <>
      <ObjectHeader project={project} title="Настройки мониторинга" />
      <p className="sub">Настройки хранятся локально, отдельно для каждого демообъекта.</p>
      <section className="spec">
        <div className="spec-side">
          <h2>Оповещения об отклонениях</h2>
          <p>Настройте, какие события отображать в демонстрационном сценарии.</p>
        </div>
        <div className="spec-main">
          {query.data ? (
            settings.map(([id, label, note]) => (
              <div className="setting-row" key={id}>
                <div>
                  <label htmlFor={id}>{label}</label>
                  <p>{note}</p>
                </div>
                <button
                  id={id}
                  role="switch"
                  aria-checked={query.data[id]}
                  aria-label={label}
                  className="toggle"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setMessage('');
                    mutation.mutate({ ...query.data!, [id]: !query.data![id] });
                  }}
                >
                  <span />
                </button>
              </div>
            ))
          ) : (
            <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
          )}
          {mutation.isPending && <p role="status">Сохранение…</p>}
          {mutation.error && (
            <p className="error-text" role="alert">
              {mutation.error.message} Предыдущее значение сохранено.
            </p>
          )}
          {message && <Notice>{message}</Notice>}
        </div>
      </section>
      <section className="spec">
        <div className="spec-side">
          <h2>Доступ сотрудников</h2>
          <p>Пример распределения прав. Эти записи не являются действующими учётными записями.</p>
        </div>
        <div className="spec-main">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник (демо)</th>
                  <th>Роль</th>
                  <th>Объект</th>
                  <th>Права</th>
                  <th>Последний вход</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Ковалёв А. Д.', 'Руководитель проекта', 'Полный доступ'],
                  ['Юсупова Д. Р.', 'Инженер ПТО', 'Редактирование'],
                  ['Тарасенко М. В.', 'Технический надзор', 'Просмотр и выгрузка'],
                ].map(([name, role, access]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{role}</td>
                    <td>{project.name}</td>
                    <td>{access}</td>
                    <td className="mono">25.08.2026</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="spec">
        <div className="spec-side">
          <h2>Демосостояние</h2>
          <p>Восстановление исходных планов и настроек всех демообъектов в этом браузере.</p>
        </div>
        <div className="spec-main reset-block">
          <button className="btn btn-quiet" onClick={() => setReset(true)}>
            Сбросить демосостояние
          </button>
        </div>
      </section>
      <Modal
        open={reset}
        onClose={() => setReset(false)}
        title="Сбросить демосостояние?"
        description="Будут восстановлены исходные планы и настройки всех демообъектов, локальные записи исчезнут из сеанса. Файлы на диске и данные API сохранятся."
      >
        <div className="actions">
          <button className="btn btn-primary" onClick={() => void resetAll()}>
            Восстановить демоданные
          </button>
          <button className="btn btn-quiet" onClick={() => setReset(false)}>
            Отмена
          </button>
        </div>
      </Modal>
    </>
  );
}
