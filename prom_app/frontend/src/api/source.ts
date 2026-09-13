import { z } from 'zod';
import { projects, projectWithStages, createReport } from '../demo/data';
import { readDemo, writeDemo } from './demoStorage';
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
function allProjects(signal: AbortSignal) {
  signal.throwIfAborted();
  return projects.map((p) => {
    try {
      const stages = readDemo('plan:' + p.id, z.array(stageSchema).max(2000).nullable(), null);
      return stages === null ? p : { ...projectWithStages(p, stages), forecast: null };
    } catch (error) {
      return {
        ...p,
        stages: [],
        forecast: null,
        stage: 'План недоступен',
        planError: error instanceof Error ? error.message : 'Не удалось прочитать план.',
      };
    }
  });
}
const demo: DataSource = {
  objects: async (signal) => allProjects(signal),
  report: async (id, period, signal) => {
    const p = allProjects(signal).find((p) => p.id === id);
    if (!p) throw new Error('Объект не найден');
    if (p.planError) throw new Error(p.planError);
    return createReport(p, period);
  },
  settings: async (id, signal) => {
    signal.throwIfAborted();
    return readDemo('settings:' + id, settingsSchema, { deviations: true, cameras: true, weekly: false });
  },
  saveSettings: async (id, settings) => {
    writeDemo('settings:' + id, settingsSchema.parse(settings));
    return settings;
  },
  savePlan: async (id, stages) => {
    writeDemo('plan:' + id, z.array(stageSchema).parse(stages));
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
