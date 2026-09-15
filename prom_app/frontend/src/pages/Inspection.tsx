import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp, useFilters, objectUrl } from '../app/context';
import { type Project, equipmentInfo, formatDate } from '../domain/models';
import { evaluateFrame, type AnalysisResult, type InspectionFrame } from '../domain/inspection';
import { orderedStages, resourcesOf } from '../domain/plan';
import { useInspectionSession } from '../features/inspection/session';
import { openImages } from '../features/inspection/images';
import { ImageViewer } from '../features/inspection/ImageViewer';
import { AssessmentCard } from '../features/inspection/AssessmentCard';
import { ImportPlan } from '../features/import/ImportPlan';
import { readAnalysisFile, downloadJson } from '../api/analysisResult';
import { loadInspectionDemo } from '../api/inspectionDemo';
import { Empty, Modal } from '../shared/ui';

export function Inspection({ project }: { project?: Project }) {
  const { mode } = useApp(),
    { objectId: pathId } = useParams(),
    { params, update } = useFilters();
  const objectId = project?.id ?? pathId ?? 'api-workspace';
  const { session, addFrames, setFrame, removeFrame, setPlan, replace } = useInspectionSession(objectId);
  const useCalendar = params.get('plan') === 'calendar' || session.plan === null;
  const plan = useMemo(
    () => (useCalendar ? (project?.stages ?? []) : (session.plan ?? [])),
    [useCalendar, project?.stages, session.plan],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ frame: InspectionFrame; result: AnalysisResult } | null>(null);
  const [demoConfirm, setDemoConfirm] = useState(false),
    [removeConfirm, setRemoveConfirm] = useState(false),
    [showAll, setShowAll] = useState(false);
  const version = useRef(0),
    working = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      version.current++;
      controller.current?.abort();
    },
    [],
  );
  const selectedId = params.get('image');
  const frame = selectedId ? session.frames.find((f) => f.id === selectedId) : session.frames[0];
  const assessments = useMemo(() => (frame ? evaluateFrame(plan, frame) : []), [frame, plan]);
  const stageId = params.get('stage');
  const displayed = assessments.filter((a) =>
    stageId ? a.stage.id === stageId : showAll || !['inactive', 'other-zone'].includes(a.status),
  );
  const warnings = assessments.filter((a) => a.status === 'warning').length;
  async function run(operation: (current: number) => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const current = ++version.current;
    try {
      await operation(current);
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : 'Не удалось завершить действие.');
    } finally {
      if (current === version.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  function add(files: File[]) {
    void run(async (current) => {
      const frames = await openImages(files, session.frames);
      if (current !== version.current) {
        frames.forEach((f) => URL.revokeObjectURL(f.url));
        return;
      }
      addFrames(frames);
      if (frames[0]) update({ image: frames[0].id, stage: null });
      setMessage(
        'Снимков добавлено: ' + frames.length + '. Файлы остаются в браузере; анализ не запускался.',
      );
    });
  }
  function demo() {
    setDemoConfirm(false);
    void run(async (current) => {
      controller.current = new AbortController();
      const data = await loadInspectionDemo(controller.current.signal);
      if (current !== version.current) return;
      replace(data.frames, data.plan);
      update({ image: data.frames[0].id, stage: null, plan: null });
      setMessage('Открыт синтетический пример ТЗ. Снимки, результаты и план демонстрационные.');
    });
  }
  function resultFile(file: File | undefined) {
    if (!file || !frame) return;
    void run(async (current) => {
      const result = await readAnalysisFile(file, frame);
      if (current === version.current) setPending({ frame, result });
    });
  }
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">{project?.name ?? 'Локальная проверка · API объектов ещё не реализован'}</p>
        <h1 className="h-page">Снимки и отклонения</h1>
        <p className="meta">Снимок → техника → правило этапа → объяснение отклонения.</p>
      </header>
      <section className="sheet sheet-pad stack">
        <div className="inspection-actions">
          <label className="btn btn-primary inspection-file">
            Добавить снимки
            <input
              type="file"
              aria-label="Снимки площадки"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => {
                add(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </label>
          <ImportPlan
            objectId={objectId}
            disabled={busy}
            onApply={(stages) => {
              setPlan(stages);
              update({ plan: null, stage: null });
            }}
          />
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => (session.frames.length || session.plan ? setDemoConfirm(true) : demo())}
          >
            Загрузить пример ТЗ
          </button>
        </div>
        <p className="sub">
          PNG, JPEG, WebP · до 20 МБ на файл, 50 снимков / 200 МБ за сеанс. Изображения и результаты доступны
          до перезагрузки или смены режима. На сервер они не отправляются.
        </p>
        {mode === 'api' && (
          <p className="sub">
            API этой ветки поддерживает загрузку видео. Для снимков доступен локальный просмотр и импорт
            результатов; серверный анализ здесь ещё не подключён.
          </p>
        )}
        {project?.planError && useCalendar && (
          <p role="alert">
            План объекта повреждён. Импортируйте план для этой проверки или восстановите его в календаре.
          </p>
        )}
        {busy && <p role="status">Читаем и проверяем данные…</p>}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
      <details className="sheet sheet-pad inspection-method">
        <summary>План и методика сопоставления · {plan.length} этапов</summary>
        <p>
          Правило v1: выбираем конечные этапы по московской дате снимка и точному названию зоны. Считаем
          детекции с уверенностью не ниже 50%. Сравниваем каждое требование отдельно. Для проверки лишней
          техники учитываем все активные этапы этой зоны.
        </p>
        <p>
          Неизвестный класс, низкая уверенность, непригодный снимок или незавершённый анализ означают
          недостаток данных. Сводные этапы не суммируются с подэтапами. Снимки сравниваются отдельно,
          количество машин между кадрами не складывается.
        </p>
        <p className="sub">
          Это проверяемая методика frontend для демонстрации сопоставления, не оценка физической готовности и
          не запуск ML. Название зоны берётся из результата анализа; оно должно совпадать с планом.
        </p>
        {plan.length ? (
          <div className="table-scroll">
            <table>
              <caption>
                {useCalendar
                  ? 'Календарный план объекта'
                  : 'План текущей проверки — отдельно от календаря объекта'}
              </caption>
              <thead>
                <tr>
                  <th>Этап</th>
                  <th>Период / зона</th>
                  <th>Необходимая техника</th>
                  <th>Проверка</th>
                </tr>
              </thead>
              <tbody>
                {orderedStages(plan).map(({ stage, depth, summary }) => (
                  <tr key={stage.id}>
                    <th scope="row" style={{ paddingInlineStart: 12 + depth * 20 }}>
                      {summary ? '▾ ' : ''}
                      {stage.name}
                    </th>
                    <td>
                      {formatDate(stage.start)} — {formatDate(stage.end)}
                      <br />
                      {stage.zone || 'Сводный этап'}
                    </td>
                    <td>
                      {resourcesOf(stage)
                        .map((r) => equipmentInfo(r.equipment).plural + ': ' + r.quantity)
                        .join('; ') || 'Не заданы'}
                    </td>
                    <td>
                      {summary
                        ? 'По подэтапам'
                        : stage.rulePolicy === 'required-only'
                          ? 'Необходимая техника'
                          : 'Необходимая и несоответствующая техника'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Импортируйте календарный план или откройте пример ТЗ.</p>
        )}
      </details>
      {!session.frames.length ? (
        <section className="sheet">
          <Empty title="Добавьте снимки площадки">
            Затем импортируйте результат распознавания для каждого снимка. Для проверки готового сценария
            используйте «Загрузить пример ТЗ».
          </Empty>
        </section>
      ) : (
        <>
          <div className="inspection-filmstrip" role="group" aria-label="Снимки текущего объекта">
            {session.frames.map((f) => (
              <button
                key={f.id}
                className="inspection-thumb"
                aria-pressed={frame?.id === f.id}
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  update({ image: f.id });
                }}
              >
                <img src={f.url} alt="" loading="lazy" />
                <span>{f.name}</span>
                <small>
                  {f.origin === 'demo' ? 'Демо' : f.result ? 'Результат импортирован' : 'Без анализа'}
                </small>
              </button>
            ))}
          </div>
          {!frame ? (
            <section className="sheet">
              <Empty
                title="Снимок недоступен"
                action={
                  <button className="btn btn-quiet" onClick={() => update({ image: null, stage: null })}>
                    Выбрать доступный снимок
                  </button>
                }
              >
                Ссылка относится к другому сеансу или удалённому снимку.
              </Empty>
            </section>
          ) : (
            <>
              <div className="inspection-board">
                <ImageViewer key={frame.id} frame={frame} />
                <aside className="sheet sheet-pad stack inspection-result">
                  <h2 className="h-sec">Результат анализа</h2>
                  <p>
                    {frame.resultSource !== 'import' && frame.origin === 'demo'
                      ? 'Демонстрационные данные'
                      : frame.result
                        ? 'Импортированный результат · файл JSON'
                        : 'Анализ не получен'}
                  </p>
                  {frame.result && (
                    <dl className="detail-grid">
                      <div>
                        <dt>Снимок сделан</dt>
                        <dd>
                          {new Date(frame.result.captured_at).toLocaleString('ru-RU', {
                            timeZone: 'Europe/Moscow',
                          })}{' '}
                          UTC+3
                        </dd>
                      </div>
                      <div>
                        <dt>Камера / зона</dt>
                        <dd>
                          {frame.result.camera_id} / {frame.result.zone}
                        </dd>
                      </div>
                      <div>
                        <dt>Состояние</dt>
                        <dd>
                          {
                            {
                              waiting: 'Ожидает обработки',
                              running: 'Обрабатывается',
                              succeeded: 'Анализ завершён',
                              failed: 'Ошибка анализа',
                            }[frame.result.state]
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Модель / источник</dt>
                        <dd>{frame.result.model}</dd>
                      </div>
                    </dl>
                  )}
                  {frame.result?.error && <p role="alert">{frame.result.error}</p>}
                  <label className="field">
                    Импортировать результат анализа (JSON)
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={busy}
                      onChange={(e) => {
                        resultFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <p className="sub">
                    Проверяются SHA-256, имя и размеры снимка. Импорт JSON не запускает распознавание.
                  </p>
                  <button
                    className="btn btn-quiet"
                    disabled={busy}
                    onClick={() =>
                      downloadJson(
                        {
                          version: 1,
                          image: {
                            name: frame.name,
                            sha256: frame.sha256,
                            width: frame.width,
                            height: frame.height,
                          },
                          captured_at: new Date().toISOString(),
                          camera_id: 'укажите-камеру',
                          zone: 'укажите-зону',
                          state: 'waiting',
                          model: 'укажите-модель',
                          quality: { usable: false, reason: 'Качество ещё не проверено' },
                          error: null,
                          detections: [],
                        },
                        frame.name + '.request.json',
                      )
                    }
                  >
                    Скачать шаблон результата
                  </button>
                  {frame.result && (
                    <button
                      className="btn btn-quiet"
                      onClick={() => downloadJson(frame.result, frame.name + '.result.json')}
                    >
                      Скачать текущий результат
                    </button>
                  )}
                  <button className="btn btn-quiet" disabled={busy} onClick={() => setRemoveConfirm(true)}>
                    Убрать снимок из сеанса
                  </button>
                </aside>
              </div>
              <section className="sheet sheet-pad stack" aria-label="Сопоставление снимка с планом">
                <div className="section-heading">
                  <h2 className="h-sec">Отклонения по снимку</h2>
                  <strong>{warnings ? 'Предупреждений: ' + warnings : 'Проверка этапов'}</strong>
                </div>
                <p className="sub">
                  Доказательство: {frame.name}
                  {frame.result
                    ? ' · зона ' +
                      frame.result.zone +
                      ' · ' +
                      new Date(frame.result.captured_at).toLocaleString('ru-RU', {
                        timeZone: 'Europe/Moscow',
                      }) +
                      ' UTC+3'
                    : ''}
                  .
                </p>
                {stageId && (
                  <button className="btn-link" onClick={() => update({ stage: null })}>
                    Показать все этапы
                  </button>
                )}
                <label className="check">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                  Показать неактивные этапы и другие зоны
                </label>
                {displayed.map((a) => (
                  <AssessmentCard key={a.stage.id} assessment={a} />
                ))}
                {!displayed.length && (
                  <Empty title={plan.length ? 'Нет подходящих этапов' : 'Нет календарного плана'}>
                    Проверьте план, дату и зону снимка{stageId ? ' или сбросьте фильтр этапа' : ''}.
                  </Empty>
                )}
                <p className="sub">
                  Показанный снимок является основанием только для подходящих по дате и зоне этапов.
                  Отсутствие в кадре не доказывает отсутствие техники за пределами обзора.
                </p>
                {project && (
                  <Link className="btn-link" to={objectUrl(objectId, 'schedule', params)}>
                    Открыть календарь объекта →
                  </Link>
                )}
              </section>
            </>
          )}
        </>
      )}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Применить результат анализа?"
        description="Результат будет привязан только к снимку с совпадающими именем, SHA-256 и размерами."
      >
        {pending && (
          <>
            <p>
              {pending.frame.name} · {pending.result.image.width} × {pending.result.image.height} px
            </p>
            <p>
              Камера {pending.result.camera_id}, зона {pending.result.zone}. Время:{' '}
              {pending.result.captured_at}. Детекций: {pending.result.detections.length}.
            </p>
            <p>
              {pending.result.state === 'succeeded'
                ? 'Анализ завершён'
                : 'Состояние анализа: ' + pending.result.state}{' '}
              · {pending.result.model}
            </p>
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setFrame({ ...pending.frame, result: pending.result, resultSource: 'import' });
                  setPending(null);
                  setMessage('Результат импортирован. Сопоставление с планом обновлено.');
                }}
              >
                Применить результат
              </button>
              <button className="btn btn-quiet" onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={demoConfirm}
        onClose={() => setDemoConfirm(false)}
        title="Открыть пример ТЗ?"
        description="Снимки и план текущей проверки будут заменены синтетическим примером. Календарь объекта и файлы на диске сохранятся."
      >
        <button className="btn btn-primary" onClick={demo}>
          Открыть демонстрационный набор
        </button>
      </Modal>
      <Modal
        open={removeConfirm}
        onClose={() => setRemoveConfirm(false)}
        title="Убрать снимок?"
        description="Снимок и его результат исчезнут из текущего сеанса. Исходный файл на диске сохранится."
      >
        <button
          className="btn btn-primary"
          onClick={() => {
            if (frame) removeFrame(frame);
            update({ image: null });
            setRemoveConfirm(false);
          }}
        >
          Убрать снимок
        </button>
      </Modal>
    </>
  );
}
