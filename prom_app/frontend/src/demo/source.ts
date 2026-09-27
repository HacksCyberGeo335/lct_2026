import { planSchema } from '../domain/plan';
import { projects, projectWithStages, createReport } from './data';
import { readDemo, writeDemo } from '../api/demoStorage';
import { settingsSchema } from '../domain/models';
import type { DataSource } from '../api/source';
function allProjects(signal: AbortSignal) {
  signal.throwIfAborted();
  return projects.map((p) => {
    try {
      const stages = readDemo('plan:' + p.id, planSchema.nullable(), null);
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
export const demoSource: DataSource = {
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
    writeDemo('plan:' + id, planSchema.parse(stages));
  },
};
