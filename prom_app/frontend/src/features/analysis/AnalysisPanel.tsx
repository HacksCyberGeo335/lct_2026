import { useId } from 'react';
import type { FileAnalysis } from './types';

export function AnalysisPanel({
  fileId,
  fileName,
  analysis,
}: {
  fileId: string;
  fileName: string;
  analysis?: FileAnalysis;
}) {
  const titleId = useId();
  // Never show another file's response while selection or a future request changes.
  const current = analysis?.fileId === fileId ? analysis : undefined;
  const status = current?.status ?? 'unavailable';
  const busy = status === 'queued' || status === 'processing';
  const statusLabels = {
    unavailable: 'Обработка ещё не подключена',
    queued: 'В очереди на обработку',
    processing: 'Обработка данных',
    completed: 'Обработка завершена',
    failed: 'Ошибка обработки',
  };
  return (
    <section className="analysis-panel stack" aria-labelledby={titleId}>
      <div className="section-heading">
        <h2 id={titleId} className="h-sec">
          Обработка и результат анализа
        </h2>
        {status === 'unavailable' && <span className="analysis-placeholder">Анализ пока недоступен</span>}
      </div>
      <p className="sub analysis-file">Файл: {fileName}</p>
      <ol className="analysis-steps" aria-label="Этапы обработки файла">
        <li>
          <strong>1. Загрузка</strong>
          <span>Файл сохранён</span>
        </li>
        <li aria-current={busy ? 'step' : undefined}>
          <strong>2. Обработка</strong>
          <span>{statusLabels[status]}</span>
        </li>
        <li aria-current={status === 'completed' ? 'step' : undefined}>
          <strong>3. Заключение</strong>
          <span>{status === 'completed' ? 'Ответ получен' : 'Ответа пока нет'}</span>
        </li>
      </ol>
      <div className="analysis-output stack" aria-live="polite" aria-atomic="true">
        <h3 className="h-sec">Результат анализа</h3>
        {status === 'unavailable' && (
          <>
            <p>Здесь появится ответ модели по выбранному фото или видео.</p>
            <p className="sub">
              Файл загружен, но обработка ещё не запускалась: сервис анализа пока не подключён. После
              подключения здесь будут отображаться состояние обработки и полученный ответ.
            </p>
          </>
        )}
        {busy && (
          <>
            <p>{statusLabels[status]}. Ответ появится после завершения анализа.</p>
            <progress aria-label="Ожидание результата анализа" />
          </>
        )}
        {current?.status === 'completed' && (
          <>
            {current.model && <p className="sub">Модель: {current.model}</p>}
            {/* Render model output as text, never as trusted HTML. */}
            <p className="analysis-text">
              {current.text.trim() ? current.text : 'Модель вернула пустой ответ.'}
            </p>
          </>
        )}
        {current?.status === 'failed' && (
          <p role="alert" className="error-text">
            {current.error || 'Не удалось получить ответ модели.'} Исходный файл сохранён.
          </p>
        )}
      </div>
    </section>
  );
}
