import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { source } from '../api/source';
import type { Mode, Recording } from '../domain/models';
export interface LocalRecording extends Recording {
  objectId: string;
}
export interface AppContextValue {
  mode: Mode;
  apiBase: string;
  changeMode: (mode: Mode) => void;
  recordings: LocalRecording[];
  addRecording: (r: LocalRecording) => void;
  clearRecordings: () => void;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('Нет контекста приложения');
  return value;
}
export function useObjects() {
  const { mode } = useApp();
  return useQuery({
    queryKey: [mode, 'objects'],
    queryFn: ({ signal }) => source(mode).objects(signal),
    retry: false,
  });
}
export function useProject() {
  const { objectId } = useParams();
  const query = useObjects();
  return { ...query, project: query.data?.find((p) => p.id === objectId), objectId: objectId ?? '' };
}
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const update = (values: Record<string, string | null>, replace = false) => {
    // Browser history updates before React's route transition commits. Read it at
    // the event boundary so rapid changes to different filters cannot erase one another.
    const next = new URLSearchParams(window.location.search);
    Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setParams(next, { replace });
  };
  return { params, update };
}
export function objectUrl(id: string, section = '', params = new URLSearchParams()) {
  return (
    '/objects/' +
    encodeURIComponent(id) +
    (section ? '/' + section : '') +
    (params.size ? '?' + params.toString() : '')
  );
}
