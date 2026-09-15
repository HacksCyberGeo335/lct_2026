import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { InspectionFrame } from '../../domain/inspection';
import type { Stage } from '../../domain/models';

interface InspectionSession {
  frames: InspectionFrame[];
  plan: Stage[] | null;
}
const emptySession: InspectionSession = { frames: [], plan: null };
interface Store {
  sessions: Record<string, InspectionSession>;
  update: (id: string, change: (old: InspectionSession) => InspectionSession) => void;
  own: (url: string) => void;
  release: (url: string) => void;
  clear: () => void;
}
const InspectionContext = createContext<Store | null>(null);
export function InspectionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, InspectionSession>>({});
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const owned = urls.current;
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);
  return (
    <InspectionContext.Provider
      value={{
        sessions,
        clear: () => {
          urls.current.forEach((url) => URL.revokeObjectURL(url));
          urls.current.clear();
          setSessions({});
        },
        update: (id, change) =>
          setSessions((old) => ({ ...old, [id]: change(Object.hasOwn(old, id) ? old[id] : emptySession) })),
        own: (url) => {
          if (url.startsWith('blob:')) urls.current.add(url);
        },
        release: (url) => {
          URL.revokeObjectURL(url);
          urls.current.delete(url);
        },
      }}
    >
      {children}
    </InspectionContext.Provider>
  );
}
export function useInspectionSession(objectId: string) {
  const store = useContext(InspectionContext);
  if (!store) throw new Error('Нет контекста проверки снимков');
  const session = Object.hasOwn(store.sessions, objectId) ? store.sessions[objectId] : emptySession;
  return {
    session,
    addFrames: (frames: InspectionFrame[]) => {
      frames.forEach((f) => store.own(f.url));
      store.update(objectId, (old) => ({ ...old, frames: [...old.frames, ...frames] }));
    },
    setFrame: (frame: InspectionFrame) =>
      store.update(objectId, (old) => ({
        ...old,
        frames: old.frames.map((f) => (f.id === frame.id ? frame : f)),
      })),
    removeFrame: (frame: InspectionFrame) => {
      store.release(frame.url);
      store.update(objectId, (old) => ({ ...old, frames: old.frames.filter((f) => f.id !== frame.id) }));
    },
    setPlan: (plan: Stage[]) => store.update(objectId, (old) => ({ ...old, plan })),
    replace: (frames: InspectionFrame[], plan: Stage[]) => {
      session.frames.forEach((f) => store.release(f.url));
      frames.forEach((f) => store.own(f.url));
      store.update(objectId, () => ({ frames, plan }));
    },
  };
}

export function useClearInspections() {
  const store = useContext(InspectionContext);
  if (!store) throw new Error('Нет контекста проверки снимков');
  return store.clear;
}
