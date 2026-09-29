import { useEffect, useRef, useState } from 'react';
import type { Catalog } from '../../domain/catalog';
import { validateProfile, type CatalogProfile } from '../../domain/catalogInspection';
import { downloadJson } from '../../api/analysisResult';
import { Modal } from '../../shared/ui';

export function profileKey(mode: string, siteId: string) {
  return 'stroykontrol:' + mode + ':v1:catalog-profile:' + siteId;
}
export function readProfile(mode: string, siteId: string, catalog: Catalog) {
  const saved = localStorage.getItem(profileKey(mode, siteId));
  return saved ? validateProfile(JSON.parse(saved), catalog, siteId) : null;
}
export function ProfileStorage({
  profile,
  catalog,
  mode,
  onApply,
  onSaved,
}: {
  profile: CatalogProfile;
  catalog: Catalog;
  mode: string;
  onApply: (p: CatalogProfile) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState<CatalogProfile | null>(null);
  const [messageProfile, setMessageProfile] = useState(() => {
    try {
      return JSON.stringify(readProfile(mode, profile.siteId, catalog));
    } catch {
      return '';
    }
  });
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  async function read(file?: File) {
    const current = ++version.current;
    setError('');
    setMessage('');
    setPending(null);
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.json') || file.size > 128 * 1024)
        throw new Error('Нужен JSON-профиль до 128 КБ.');
      const parsed = validateProfile(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())),
        catalog,
        profile.siteId,
      );
      if (current === version.current) setPending(parsed);
    } catch (e) {
      if (current === version.current) setError(e instanceof Error ? e.message : 'Ошибка профиля.');
    }
  }
  function save(download: boolean) {
    setError('');
    setMessage('');
    try {
      const valid = validateProfile(profile, catalog, profile.siteId);
      if (download) {
        downloadJson(valid, 'inspection-profile-' + profile.siteId + '.json');
        setMessageProfile(JSON.stringify(profile));
        setMessage('Файл профиля скачан. Снимки и справочник сохраняются отдельно.');
      } else {
        localStorage.setItem(profileKey(mode, profile.siteId), JSON.stringify(valid));
        setMessageProfile(JSON.stringify(profile));
        onSaved();
        setMessage('Профиль сохранён в этом браузере. Снимки нужно выбрать заново после перезагрузки.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить профиль.');
    }
  }
  return (
    <div className="catalog-storage">
      <p className="sub">
        {messageProfile === JSON.stringify(profile)
          ? 'Текущая версия профиля сохранена или применена'
          : 'Есть несохранённые настройки проверки'}
        . Снимки и справочник сохраняются отдельно.
      </p>
      <div className="actions">
        <button className="btn btn-quiet" onClick={() => save(false)}>
          Сохранить профиль в браузере
        </button>
        <button className="btn btn-quiet" onClick={() => save(true)}>
          Скачать профиль
        </button>
        <label className="btn btn-quiet inspection-file">
          Импорт профиля
          <input
            aria-label="JSON-профиль проверки"
            type="file"
            accept=".json"
            onChange={(e) => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && messageProfile === JSON.stringify(profile) && <p role="status">{message}</p>}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Применить профиль проверки?"
        description="Будут заменены настройки текущей проверки. Календарный план и снимки сохранятся."
      >
        {pending && (
          <>
            <p>
              {catalog.cardsById.get(pending.workId)?.canonical_work_name || 'Работа не выбрана'} · зона{' '}
              {pending.zone || 'не задана'}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setMessageProfile(JSON.stringify(pending));
                onApply(pending);
                setPending(null);
                setMessage('Профиль применён. Результаты пересчитаны.');
              }}
            >
              Применить профиль
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
