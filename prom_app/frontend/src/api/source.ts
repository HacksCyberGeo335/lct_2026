import { demoExtension } from '../app/demoExtension';
import { type ManagedProject, projectRepository } from '../features/projects/repository';
import type { Mode, Project, Stage, Settings, Report } from '../domain/models';
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
const unavailable = (feature: string): never => {
  throw new UnsupportedError(feature);
};
const api: DataSource = {
  objects: async (signal) => {
    if (!projectRepository.available) return unavailable('Реестр объектов');
    const projects = await projectRepository.list(signal);
    // Existing navigation/inspection needs only identity and the calendar.
    // These compatibility defaults must not be used as analytics or measured progress.
    return projects.map(projectView);
  },
  report: async () => unavailable('Аналитика'),
  settings: async () => unavailable('Настройки'),
  saveSettings: async () => unavailable('Сохранение настроек'),
  savePlan: async () => unavailable('Сохранение плана'),
};
export const source = (mode: Mode): DataSource =>
  mode === 'demo' && demoExtension ? demoExtension.source : api;

export function projectView(p: ManagedProject, index: number): Project {
  return {
    id: p.id,
    number: index + 1,
    name: p.name,
    district: p.district,
    permit: p.permit,
    programme: p.programme,
    stages: p.plan?.stages ?? [],
    cameras: [],
    status: 'idle' as const,
    stage: p.plan?.name ?? 'График не задан',
    progress: 0,
    planError: null,
    forecast: null,
    updatedAt: '',
    coverage: null,
  };
}
