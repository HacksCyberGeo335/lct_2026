import type { Stage } from '../../domain/models';
import type { ProjectFields } from './model';
export interface WorkPlan {
  name: string;
  stages: Stage[];
}
export interface ManagedProject extends ProjectFields {
  id: string;
  version: string;
  plan: WorkPlan | null;
}
/** UI boundary only: backend URLs/DTOs and concurrency tokens are not agreed yet. */
export interface ProjectRepository {
  available: boolean;
  list(signal: AbortSignal): Promise<ManagedProject[]>;
  create(fields: ProjectFields, plan: WorkPlan | null): Promise<ManagedProject>;
  update(project: ManagedProject, fields: ProjectFields, plan: WorkPlan | null): Promise<ManagedProject>;
  remove(project: ManagedProject): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('API объектов и графиков ещё не подключён. Изменения не сохранены.');
};
// Replace only this adapter once backend contracts are agreed. No local persistence or fake requests.
export const projectRepository: ProjectRepository = {
  available: false,
  list: unavailable,
  create: unavailable,
  update: unavailable,
  remove: unavailable,
};
