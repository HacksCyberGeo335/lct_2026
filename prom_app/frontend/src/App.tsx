import { useUnsavedChanges } from './shared/UnsavedChanges';
import { ScheduleComparison } from './pages/ScheduleComparison';
import { CatalogProvider } from './features/catalog/CatalogProvider';
import { SiteMonitoring } from './pages/SiteMonitoring';
import { MonitoringSettings } from './pages/MonitoringSettings';
import { demoExtension, demoAvailable } from './app/demoExtension';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AppContext,
  useApp,
  useObjects,
  useProject,
  withoutSourceSelection,
  type LocalRecording,
} from './app/context';
import { InspectionProvider } from './features/inspection/session';
const Inspection = lazy(() => import('./pages/Inspection').then((m) => ({ default: m.Inspection })));
import type { Mode } from './domain/models';
import { ObjectsPage } from './pages/ObjectsPage';
import { SchedulePage } from './pages/SchedulePage';
import { Empty, QueryState } from './shared/ui';
import { appearance, transition } from './shared/motion';

function ObjectRoute({
  section,
}: {
  section: 'site' | 'analytics' | 'schedule' | 'settings' | 'inspection';
}) {
  const { mode } = useApp(),
    query = useProject(),
    location = useLocation();
  if ((mode === 'api' || !demoExtension) && section === 'analytics') return <ScheduleComparison />;
  if ((mode === 'api' || !demoExtension) && section === 'site') return <SiteMonitoring />;
  if ((mode === 'api' || !demoExtension) && section === 'settings') return <MonitoringSettings />;
  if (mode === 'api' || !demoExtension)
    return section === 'inspection' ? <Inspection project={query.project} /> : <SchedulePage />;
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
  return section === 'inspection' ? (
    <Inspection key={p.id} project={p} />
  ) : section === 'site' ? (
    <demoExtension.Site key={p.id} project={p} />
  ) : section === 'analytics' ? (
    <demoExtension.Analytics key={p.id} project={p} />
  ) : section === 'schedule' ? (
    <demoExtension.Schedule key={p.id} project={p} />
  ) : (
    <demoExtension.Settings key={p.id} project={p} />
  );
}
function Shell() {
  const { mode, changeMode } = useApp(),
    query = useObjects(),
    location = useLocation(),
    navigate = useNavigate(),
    reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastObjectId, setLastObjectId] = useState(demoExtension?.initialObjectId ?? '');
  const pathObjectId = location.pathname.startsWith('/objects/')
    ? location.pathname.split('/')[2]
    : undefined;
  useEffect(() => {
    if (pathObjectId && query.data?.some((project) => project.id === pathObjectId))
      setLastObjectId(pathObjectId);
  }, [pathObjectId, query.data]);
  const objectId =
    pathObjectId ||
    (query.data?.some((p) => p.id === lastObjectId) ? lastObjectId : (query.data?.[0]?.id ?? 'unavailable'));
  const contextSearch = location.search;
  const route = '/objects/' + encodeURIComponent(objectId);
  const links = [
    ['Площадка', route],
    ['Объекты', '/objects'],
    ['Снимки и отклонения', route + '/inspection'],
    ['Соответствие графику', route + '/analytics'],
    ['График работ', route + '/schedule'],
    ['Настройки', route + '/settings'],
  ];
  const currentTitle = links.find(([, path]) => path === location.pathname)?.[0] ?? 'Стройконтроль';
  useEffect(() => {
    document.title = currentTitle + ' · Стройконтроль';
  }, [currentTitle]);
  function switchObject(id: string) {
    const params = withoutSourceSelection(new URLSearchParams(location.search));
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
          <button
            className="btn btn-quiet mobile-menu"
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? 'Закрыть меню' : currentTitle + ' · Меню'}
          </button>
          <nav
            id="main-navigation"
            className={'nav' + (menuOpen ? ' nav-open' : '')}
            aria-label="Разделы системы"
          >
            {links.map(([label, path]) => (
              <NavLink
                onClick={() => setMenuOpen(false)}
                key={label}
                end
                className="navlink"
                to={path + contextSearch}
              >
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
          <span className="who-face" title={mode === 'demo' ? 'Демонстрационный профиль' : 'Стройконтроль'}>
            {mode === 'demo' ? 'ДМ' : 'С'}
          </span>
        </div>
      </header>
      <div className="wrap contextbar no-print">
        <span className={'mode-label ' + mode}>
          {mode === 'demo' ? 'Демонстрационные данные' : 'Рабочая версия'}
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
        {demoAvailable && (
          <button className="mode-switch" onClick={() => changeMode(mode === 'demo' ? 'api' : 'demo')}>
            {mode === 'demo' ? 'Подключение API →' : 'Открыть демо →'}
          </button>
        )}
      </div>
      <main id="main" className="wrap app-main" tabIndex={-1}>
        <motion.div key={location.pathname} {...appearance(reduce)}>
          <Suspense fallback={<QueryState pending />}>
            <Routes>
              <Route path="/" element={<Navigate to={'/objects' + contextSearch} replace />} />
              <Route
                path="/objects"
                element={mode === 'demo' && demoExtension ? <demoExtension.Objects /> : <ObjectsPage />}
              />
              <Route path="/objects/:objectId" element={<ObjectRoute section="site" />} />
              <Route path="/objects/:objectId/analytics" element={<ObjectRoute section="analytics" />} />
              <Route path="/objects/:objectId/schedule" element={<ObjectRoute section="schedule" />} />
              <Route path="/objects/:objectId/inspection" element={<ObjectRoute section="inspection" />} />
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
      </main>
      <footer className="wrap footer">
        <span>Стройконтроль · Мониторинг строительства</span>
        <span>
          {mode === 'demo' ? 'Демонстрационный срез · 25 августа 2026' : 'Стройконтроль · Рабочая версия'}
        </span>
      </footer>
    </>
  );
}
export default function App({ initialMode, apiBase }: { initialMode: Mode; apiBase: string }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('mode');
  const mode = requested === 'api' ? 'api' : requested === 'demo' && demoAvailable ? 'demo' : initialMode;
  return (
    <>
      {requested === 'demo' && !demoAvailable && (
        <p className="wrap inspection-notice" role="status">
          Демонстрационный режим доступен только в ветке demo. Эта сборка работает с API.
        </p>
      )}
      <ModeSession key={mode} mode={mode} apiBase={apiBase} />
    </>
  );
}
function ModeSession({ mode, apiBase }: { mode: Mode; apiBase: string }) {
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  useUnsavedChanges(
    recordings.length > 0,
    'Список загруженных материалов доступен только в текущем сеансе.',
    false,
  );
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
      <CatalogProvider>
        <InspectionProvider>
          <Shell />
        </InspectionProvider>
      </CatalogProvider>
    </AppContext.Provider>
  );
}
