import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal } from './ui';
type Guard = { message: string; navigation: boolean };
const Context = createContext<(id: string, guard: Guard | null) => void>(() => {});
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [guards, setGuards] = useState<Record<string, Guard>>({});
  const [register] = useState(
    () => (id: string, guard: Guard | null) =>
      setGuards((old) => {
        const next = { ...old };
        if (guard) next[id] = guard;
        else delete next[id];
        return next;
      }),
  );
  const active = Object.values(guards);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active.some((g) => g.navigation) && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!active.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active.length]);
  return (
    <Context.Provider value={register}>
      {children}
      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="Покинуть страницу?"
        description="Несохранённые изменения на этой странице будут потеряны."
      >
        {active
          .filter((g) => g.navigation)
          .map((g, i) => (
            <p key={i}>{g.message}</p>
          ))}
        <div className="actions">
          <button className="btn btn-primary" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
            Остаться
          </button>
          <button className="btn btn-quiet" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
            Уйти без сохранения
          </button>
        </div>
      </Modal>
    </Context.Provider>
  );
}
export function useUnsavedChanges(dirty: boolean, message = 'Черновик не сохранён.', navigation = true) {
  const register = useContext(Context),
    id = useId();
  useEffect(() => {
    register(id, dirty ? { message, navigation } : null);
    return () => register(id, null);
  }, [dirty, id, message, navigation, register]);
}
