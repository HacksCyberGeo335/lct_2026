import { z } from 'zod';
import { projects, projectWithStages, createReport } from '../demo/data';
import {
  settingsSchema,
  stageSchema,
  type Mode,
  type Project,
  type Stage,
  type Settings,
  type Report,
} from '../domain/models';

export class UnsupportedError extends Error {
  constructor(feature: string) {
    super(feature + ': серверный контракт пока не реализован.');
    this.name = 'UnsupportedError';
  }
}
export interface DataSource {
  objects(signal: AbortSignal): Promise<Project[]>;
  report(id: string, period: number, signal: AbortSignal): Promise<Report>;
  settings(id: string, signal: AbortSignal): Promise<Settings>;
  saveSettings(id: string, settings: Settings): Promise<Settings>;
  savePlan(id: string, stages: Stage[]): Promise<void>;
}
const prefix = 'stroykontrol:demo:v1:';
function read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  const saved = localStorage.getItem(prefix + key);
  if (!saved) return fallback;
  try {
    return schema.parse(JSON.parse(saved));
  } catch {
    throw new Error('Локальные демоданные повреждены. Сбросьте демосостояние в настройках.');
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    throw new Error(
      'Не удалось сохранить в браузере: хранилище недоступно или заполнено. Изменения не применены.',
    );
  }
}
function allProjects(signal: AbortSignal) {
  signal.throwIfAborted();
  return projects.map((p) => projectWithStages(p, read('plan:' + p.id, z.array(stageSchema), p.stages)));
}
const demo: DataSource = {
  objects: async (signal) => allProjects(signal),
  report: async (id, period, signal) => {
    const p = allProjects(signal).find((p) => p.id === id);
    if (!p) throw new Error('Объект не найден');
    return createReport(p, period);
  },
  settings: async (id, signal) => {
    signal.throwIfAborted();
    return read('settings:' + id, settingsSchema, { deviations: true, cameras: true, weekly: false });
  },
  saveSettings: async (id, settings) => {
    write('settings:' + id, settingsSchema.parse(settings));
    return settings;
  },
  savePlan: async (id, stages) => {
    write('plan:' + id, z.array(stageSchema).parse(stages));
  },
};
const unavailable = (feature: string): never => {
  throw new UnsupportedError(feature);
};
const api: DataSource = {
  objects: async () => unavailable('Реестр объектов'),
  report: async () => unavailable('Аналитика'),
  settings: async () => unavailable('Настройки'),
  saveSettings: async () => unavailable('Сохранение настроек'),
  savePlan: async () => unavailable('Сохранение плана'),
};
export const source = (mode: Mode): DataSource => (mode === 'demo' ? demo : api);
export function resetDemo() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => localStorage.removeItem(k));
}
