import { useState } from 'react';
export function MonitoringSettings() {
  const [settings, setSettings] = useState({ weekly: false, deviations: false, cameras: false });
  const [emails, setEmails] = useState('');
  const options = [
    ['weekly', 'Сводка о ходе строительства', 'Еженедельный отчёт о состоянии объекта и выполнении графика.'],
    ['deviations', 'Оповещения об отклонениях', 'Уведомления о выявленных расхождениях с планом работ.'],
    ['cameras', 'Недоступность камер', 'Уведомления при потере связи с камерой.'],
  ] as const;
  const invalid = emails
    .split(/[;,\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .some((v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Параметры мониторинга</p>
        <h1 className="h-page">Настройки мониторинга</h1>
        <p className="meta">Уведомления, получатели и доступ сотрудников.</p>
      </header>
      <p className="inspection-notice">
        Сервис уведомлений ещё не подключён. Ни один канал сейчас не активен. Изменения остаются черновиком
        открытой страницы, письма не отправляются.
      </p>
      <section className="spec">
        <div className="spec-side">
          <h2>Оповещения</h2>
          <p>Какие события включать в уведомления.</p>
        </div>
        <div className="spec-main">
          {options.map(([key, title, description]) => (
            <div className="setting-row" key={key}>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <button
                className="toggle"
                role="switch"
                aria-label={title}
                aria-checked={settings[key]}
                onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
              >
                <span />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="spec">
        <div className="spec-side">
          <h2>Почтовая рассылка</h2>
          <p>Получатели отчётов и уведомлений.</p>
        </div>
        <div className="spec-main stack">
          <label className="field">
            Адреса электронной почты
            <textarea
              rows={3}
              maxLength={4000}
              value={emails}
              aria-invalid={invalid}
              aria-describedby="email-hint"
              onChange={(e) => setEmails(e.target.value)}
            />
          </label>
          <p className="sub" id="email-hint">
            Разделяйте адреса запятой, точкой с запятой или новой строкой.
          </p>
          {invalid && (
            <p role="alert" className="error-text">
              Проверьте адреса электронной почты.
            </p>
          )}
          <button className="btn btn-primary" disabled>
            Сохранить настройки — API не подключён
          </button>
        </div>
      </section>
      <section className="spec">
        <div className="spec-side">
          <h2>Доступ сотрудников</h2>
          <p>Управление доступом к объектам.</p>
        </div>
        <div className="spec-main">
          <p>Список сотрудников и управление правами появятся после подключения серверного API.</p>
        </div>
      </section>
    </>
  );
}
