import { useEffect, useRef, useState } from 'react';
import type { Catalog } from '../../domain/catalog';
import { Modal } from '../../shared/ui';
import { downloadJson } from '../../api/analysisResult';
import { bundleOf, readCatalogBundle, validateBundle, type CatalogBundle } from './catalogBundle';
import { useCatalogChoice } from './CatalogProvider';
export function CatalogManager({ builtin }: { builtin?: Catalog }) {
  const { custom, setCustom } = useCatalogChoice();
  const current = custom?.catalog ?? builtin;
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ catalog: Catalog; name: string } | null>(null);
  const [restore, setRestore] = useState(false);
  const [editing, setEditing] = useState<CatalogBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  return (
    <section className="sheet sheet-pad stack" aria-label="Управление справочником">
      <div className="section-heading">
        <h2 className="h-sec">Справочник работ</h2>
        <span className="sub">{custom ? 'Пользовательская версия' : 'Встроенный справочник'}</span>
      </div>
      <p>
        {custom?.name ?? 'Справочник проекта'}
        {current && ` · ${current.cards.length} работ`}
      </p>
      <p className="sub">
        Используйте справочник проекта, загрузите свой JSON или отредактируйте копию текущего.
        Пользовательская версия действует в этой вкладке до перезагрузки. Для сохранения скачайте файл; на
        сервер изменения не отправляются.
      </p>
      <div className="actions">
        <label className="btn btn-quiet inspection-file">
          Загрузить свой справочник
          <input
            aria-label="Файл справочника"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const attempt = ++version.current;
              setBusy(true);
              setError('');
              try {
                const parsed = await readCatalogBundle(file);
                if (attempt === version.current)
                  setPending({ catalog: parsed.catalog, name: parsed.bundle.name });
              } catch (e) {
                if (attempt === version.current)
                  setError(
                    e instanceof Error && !('issues' in e)
                      ? e.message
                      : 'Некорректный справочник. Сверьте формат и обязательные поля с шаблоном.',
                  );
              } finally {
                if (attempt === version.current) setBusy(false);
              }
            }}
          />
        </label>
        <button
          className="btn btn-quiet"
          disabled={!current || busy}
          onClick={() =>
            current &&
            downloadJson(bundleOf(current, custom?.name ?? 'Мой справочник'), 'construction-catalog.json')
          }
        >
          Скачать справочник / шаблон
        </button>
        <button
          className="btn btn-primary"
          disabled={!current || busy}
          onClick={() => {
            setError('');
            if (current) setEditing(structuredClone(bundleOf(current, custom?.name ?? 'Мой справочник')));
          }}
        >
          Редактировать копию
        </button>
        {custom && (
          <button className="btn btn-quiet" disabled={!builtin || busy} onClick={() => setRestore(true)}>
            Использовать встроенный
          </button>
        )}
      </div>
      {busy && <p role="status">Проверяем справочник…</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <Modal
        open={!!pending || restore}
        onClose={() => {
          setPending(null);
          setRestore(false);
        }}
        title="Сменить справочник?"
        description="Выбор работы и профиль проверки потребуется настроить заново. Снимки сохранятся. Загруженный календарь может потребовать повторного сопоставления работ."
      >
        <p>{pending?.name ?? 'Встроенный справочник проекта'}</p>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCustom(restore ? null : pending);
            setPending(null);
            setRestore(false);
          }}
        >
          Применить справочник
        </button>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Редактирование справочника"
        description="Редактируется копия. Изменённые требования не считаются проверенными составителем исходного справочника."
      >
        {editing && (
          <CatalogEditor
            initial={editing}
            onApply={async (bundle) => {
              const parsed = await validateBundle(bundle);
              setPending({ catalog: parsed.catalog, name: bundle.name });
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </section>
  );
}
function CatalogEditor({
  initial,
  onApply,
}: {
  initial: CatalogBundle;
  onApply: (bundle: CatalogBundle) => Promise<void>;
}) {
  const [bundle, setBundle] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState(initial.cards.cards[0].id);
  const [error, setError] = useState('');
  const card = bundle.cards.cards.find((c) => c.id === id)!;
  const work = bundle.equipment.works.find((w) => w.work_id === id)!;
  function rename(name: string) {
    setBundle({
      ...bundle,
      cards: {
        ...bundle.cards,
        cards: bundle.cards.cards.map((c) =>
          c.id === id ? { ...c, work_name: name, canonical_work_name: name } : c,
        ),
      },
      equipment: {
        ...bundle.equipment,
        works: bundle.equipment.works.map((w) =>
          w.work_id === id ? { ...w, work_name: name, canonical_work_name: name } : w,
        ),
      },
      durations: {
        ...bundle.durations,
        works: bundle.durations.works.map((w) => (w.work_id === id ? { ...w, work_name: name } : w)),
      },
    });
  }
  return (
    <div className="stack">
      <label className="field">
        Название справочника
        <input
          value={bundle.name}
          maxLength={200}
          onChange={(e) => setBundle({ ...bundle, name: e.target.value })}
        />
      </label>
      <label className="field">
        Редактируемая работа
        <select aria-label="Редактируемая работа" value={id} onChange={(e) => setId(e.target.value)}>
          {bundle.cards.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.canonical_work_name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Название работы
        <input value={card.canonical_work_name} maxLength={300} onChange={(e) => rename(e.target.value)} />
      </label>
      <label className="field">
        Визуальные признаки
        <textarea
          rows={4}
          value={card.positive_visual_signs.join('\n')}
          onChange={(e) =>
            setBundle({
              ...bundle,
              cards: {
                ...bundle.cards,
                cards: bundle.cards.cards.map((c) =>
                  c.id === id ? { ...c, positive_visual_signs: e.target.value.split('\n') } : c,
                ),
              },
            })
          }
        />
      </label>
      <p className="sub">
        По одному признаку на строку. Ниже — техника для каждой существующей группы требований. Достаточно
        одной выбранной альтернативы; это не количество машин.
      </p>
      {(['required_equipment', 'conditional_required_equipment'] as const).flatMap((key) =>
        work[key].map((group) => (
          <fieldset key={group.requirement_id}>
            <legend>
              {group.equipment_name_ru} · {group.phase}
            </legend>
            <p className="sub">{group.condition}</p>
            <div className="catalog-class-list">
              {bundle.equipment.equipment_ontology
                .filter((item) => item.detector_classes.length || group.one_of.includes(item.id))
                .map((item) => (
                  <label className="check" key={item.id}>
                    <input
                      type="checkbox"
                      checked={group.one_of.includes(item.id)}
                      onChange={(e) =>
                        setBundle({
                          ...bundle,
                          equipment: {
                            ...bundle.equipment,
                            works: bundle.equipment.works.map((w) =>
                              w.work_id !== id
                                ? w
                                : {
                                    ...w,
                                    [key]: w[key].map((g) =>
                                      g.requirement_id !== group.requirement_id
                                        ? g
                                        : {
                                            ...g,
                                            one_of: e.target.checked
                                              ? [...g.one_of, item.id]
                                              : g.one_of.filter((v) => v !== item.id),
                                            source_ids: [],
                                            evidence_level: 'USER_DEFINED',
                                            rationale: 'Задано пользователем',
                                            alternatives_exhaustive: false,
                                          },
                                    ),
                                  },
                            ),
                          },
                        })
                      }
                    />
                    {item.name_ru}
                  </label>
                ))}
            </div>
          </fieldset>
        )),
      )}
      {!work.required_equipment.length && !work.conditional_required_equipment.length && (
        <p>
          У этой работы нет обязательных групп техники. Новые группы и структуру работ можно задать в
          импортируемом JSON по шаблону.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button
        className="btn btn-primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const cleaned = {
              ...bundle,
              cards: {
                ...bundle.cards,
                cards: bundle.cards.cards.map((c) => ({
                  ...c,
                  positive_visual_signs: c.positive_visual_signs.map((v) => v.trim()).filter(Boolean),
                })),
              },
            };
            await onApply(cleaned);
          } catch {
            setError('Проверьте названия и оставьте хотя бы одну альтернативу в каждой группе техники.');
          } finally {
            setSaving(false);
          }
        }}
      >
        Проверить и применить копию
      </button>
    </div>
  );
}
