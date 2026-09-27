import { demoExtension } from '../app/demoExtension';
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
  objects: async () => unavailable('Реестр объектов'),
  report: async () => unavailable('Аналитика'),
  settings: async () => unavailable('Настройки'),
  saveSettings: async () => unavailable('Сохранение настроек'),
  savePlan: async () => unavailable('Сохранение плана'),
};
export const source = (mode: Mode): DataSource =>
  mode === 'demo' && demoExtension ? demoExtension.source : api;
