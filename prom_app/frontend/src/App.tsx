import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { AppContext, useApp, useObjects, useProject, type LocalRecording } from './app/context';
import type { Mode } from './domain/models';
import { Objects } from './pages/Objects';
const Site = lazy(() => import('./pages/Site').then((module) => ({ default: module.Site })));
const Analytics = lazy(() => import('./pages/Analytics').then((module) => ({ default: module.Analytics })));
const Schedule = lazy(() => import('./pages/Schedule').then((module) => ({ default: module.Schedule })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
import { ApiWorkspace } from './pages/ApiWorkspace';
import { Empty, QueryState } from './shared/ui';
import { appearance, transition } from './shared/motion';
import { resetDemo } from './api/source';

function ObjectRoute({ section }: { section: 'site' | 'analytics' | 'schedule' | 'settings' }) {
  const { mode } = useApp(),
    query = useProject(),
    location = useLocation();
  if (mode === 'api') return <ApiWorkspace section={section} />;
  if (query.isPending || query.error)
    return <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  if (!query.project)
    return (
      <Empty
        title="Объект не найден"
        action={
          <Link className="btn btn-quiet" to={'/objects' + location.search}>
            Открыть ведомость
          </Link>
        }
      >
        Возможно, ссылка устарела или объект недоступен.
      </Empty>
    );
  const p = query.project;
  return section === 'site' ? (
    <Site key={p.id} project={p} />
  ) : section === 'analytics' ? (
    <Analytics key={p.id} project={p} />
  ) : section === 'schedule' ? (
    <Schedule key={p.id} project={p} />
  ) : (
    <Settings key={p.id} project={p} />
  );
}
function Shell() {
  const { mode, changeMode, clearRecordings } = useApp(),
    query = useObjects(),
    location = useLocation(),
    navigate = useNavigate(),
    reduce = useReducedMotion();
  const [lastObjectId, setLastObjectId] = useState('north-park');
  const pathObjectId = location.pathname.startsWith('/objects/')
    ? location.pathname.split('/')[2]
    : undefined;
  useEffect(() => {
    if (pathObjectId && query.data?.some((project) => project.id === pathObjectId))
      setLastObjectId(pathObjectId);
  }, [pathObjectId, query.data]);
  const objectId = pathObjectId || (mode === 'demo' ? lastObjectId : 'unavailable');
  const contextSearch = location.search;
  const route = '/objects/' + encodeURIComponent(objectId);
  const links = [
    ['Площадка', route],
    ['Объекты', '/objects'],
    ['Соответствие графику', route + '/analytics'],
    ['График работ', route + '/schedule'],
    ['Настройки', route + '/settings'],
  ];
  const currentTitle = links.find(([, path]) => path === location.pathname)?.[0] ?? 'Стройконтроль';
  useEffect(() => {
    document.title = currentTitle + ' · Стройконтроль';
  }, [currentTitle]);
  function switchObject(id: string) {
    const params = new URLSearchParams(location.search);
    ['camera', 'recording', 't'].forEach((k) => params.delete(k));
    const section = location.pathname.split('/')[3];
    navigate('/objects/' + id + (section ? '/' + section : '') + (params.size ? '?' + params : ''));
  }
  return (
    <>
      <a href="#main" className="skip">
        Перейти к основному содержанию
      </a>
      <header className="chrome">
        <div className="wrap chrome-inner">
          <Link className="mark" to={'/objects' + contextSearch} aria-label="Стройконтроль — ведомость">
            <span className="mark-glyph">С</span>
            <span>
              <span className="mark-name">Стройконтроль</span>
              <span className="mark-sub">Мониторинг площадок</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Разделы системы">
            {links.map(([label, path]) => (
              <NavLink key={label} end className="navlink" to={path + contextSearch}>
                {({ isActive }) => (
                  <>
                    {label}
                    {isActive && (
                      <motion.span
                        className="nav-indicator"
                        layoutId={reduce ? undefined : 'active-nav'}
                        transition={transition(reduce)}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <span className="who-face" title={mode === 'demo' ? 'Демонстрационный профиль' : 'API'}>
            {mode === 'demo' ? 'ДМ' : 'API'}
          </span>
        </div>
      </header>
      <div className="wrap contextbar no-print">
        <span className={'mode-label ' + mode}>
          {mode === 'demo' ? 'Демонстрационные данные' : 'Рабочее подключение API'}
        </span>
        {location.pathname !== '/objects' && query.data && (
          <label className="object-switch">
            <span className="sr-only">Выбранный объект</span>
            <select value={objectId} onChange={(e) => switchObject(e.target.value)}>
              {!query.data.some((p) => p.id === objectId) && (
                <option value={objectId}>Объект не найден</option>
              )}
              {query.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="mode-switch" onClick={() => changeMode(mode === 'demo' ? 'api' : 'demo')}>
          {mode === 'demo' ? 'Подключение API →' : 'Открыть демо →'}
        </button>
      </div>
      <main id="main" className="wrap app-main" tabIndex={-1}>
        <motion.div key={location.pathname} {...appearance(reduce)}>
          <Suspense fallback={<QueryState pending />}>
            <Routes>
              <Route path="/" element={<Navigate to={'/objects' + contextSearch} replace />} />
              <Route path="/objects" element={<Objects />} />
              <Route path="/objects/:objectId" element={<ObjectRoute section="site" />} />
              <Route path="/objects/:objectId/analytics" element={<ObjectRoute section="analytics" />} />
              <Route path="/objects/:objectId/schedule" element={<ObjectRoute section="schedule" />} />
              <Route path="/objects/:objectId/settings" element={<ObjectRoute section="settings" />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="Страница не найдена"
                    action={
                      <Link className="btn btn-primary" to={'/objects' + contextSearch}>
                        Перейти к объектам
                      </Link>
                    }
                  >
                    Проверьте адрес страницы.
                  </Empty>
                }
              />
            </Routes>
          </Suspense>
        </motion.div>
        {query.error && mode === 'demo' && (
          <button
            className="btn btn-quiet"
            onClick={() => {
              resetDemo();
              clearRecordings();
              void query.refetch();
            }}
          >
            Восстановить исходные демоданные
          </button>
        )}
      </main>
      <footer className="wrap footer">
        <span>Стройконтроль · Мониторинг строительства</span>
        <span>
          {mode === 'demo'
            ? 'Демонстрационный срез · 25 августа 2026'
            : 'API · возможности зависят от серверных контрактов'}
        </span>
      </footer>
    </>
  );
}
export default function App({ initialMode, apiBase }: { initialMode: Mode; apiBase: string }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('mode');
  const mode = requested === 'demo' || requested === 'api' ? requested : initialMode;
  return <ModeSession key={mode} mode={mode} apiBase={apiBase} />;
}
function ModeSession({ mode, apiBase }: { mode: Mode; apiBase: string }) {
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  const ownedUrls = useRef(new Set<string>()),
    navigate = useNavigate();
  const clearRecordings = () => {
    ownedUrls.current.forEach((url) => URL.revokeObjectURL(url));
    ownedUrls.current.clear();
    setRecordings([]);
  };
  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  function changeMode(next: Mode) {
    navigate('/objects?mode=' + next);
  }
  function addRecording(recording: LocalRecording) {
    if (recording.url?.startsWith('blob:')) ownedUrls.current.add(recording.url);
    setRecordings((items) => [...items, recording]);
  }
  return (
    <AppContext.Provider value={{ mode, apiBase, changeMode, recordings, addRecording, clearRecordings }}>
      <Shell />
    </AppContext.Provider>
  );
}
