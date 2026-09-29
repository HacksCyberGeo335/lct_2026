import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, type LocalRecording } from '../../app/context';
import { useInspectionSession } from '../inspection/session';
import { openImages } from '../inspection/images';
export function OpenInInspection({ recording }: { recording?: LocalRecording }) {
  const { recordings } = useApp(),
    { objectId: routeObjectId = 'unavailable' } = useParams();
  const objectId = recording?.objectId || routeObjectId;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { session, addFrames } = useInspectionSession(objectId);
  const [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  const available = recordings.filter(
    (r) => (!r.objectId || r.objectId === objectId) && r.kind === 'image' && r.sourceFile,
  );
  const file = recording ?? available.find((r) => r.id === selected);
  async function open() {
    if (!file?.sourceFile || busy) return;
    setBusy(true);
    setError('');
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.sourceFile.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (!alive.current) return;
      let frame = session.frames.find((f) => f.sha256 === hash);
      if (!frame) {
        const frames = await openImages([file.sourceFile], session.frames);
        if (!alive.current) {
          frames.forEach((f) => URL.revokeObjectURL(f.url));
          return;
        }
        addFrames(frames);
        frame = frames[0];
      }
      if (frame)
        navigate(
          '/objects/' + encodeURIComponent(objectId) + '/inspection?image=' + encodeURIComponent(frame.id),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть снимок.');
    } finally {
      setBusy(false);
    }
  }
  if (recording?.kind === 'video')
    return (
      <p className="sub">
        Автоматическое извлечение кадров из видео пока недоступно. Для проверки добавьте отдельный снимок.
      </p>
    );
  if (!recording && !available.length) return null;
  return (
    <div className="stack">
      {!recording && (
        <label className="field">
          Уже загруженные фото
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Выберите фото</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn btn-quiet" disabled={!file?.sourceFile || busy} onClick={() => void open()}>
        {busy ? 'Открываем снимок…' : 'Открыть в проверке'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
