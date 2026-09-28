import { z } from 'zod';
import type { Stage } from '../../domain/models';

const text = z.string().trim().max(300);
export const projectFieldsSchema = z.object({
  name: text.min(1, 'Укажите название объекта.'),
  address: text.min(1, 'Укажите адрес объекта.'),
  developer: text.min(1, 'Укажите застройщика.'),
  district: text,
  permit: text,
  programme: text,
  contractor: text,
  contact: text,
  notes: z.string().trim().max(4000),
});
export type ProjectFields = z.infer<typeof projectFieldsSchema>;
export const emptyProjectFields: ProjectFields = {
  name: '',
  address: '',
  developer: '',
  district: '',
  permit: '',
  programme: '',
  contractor: '',
  contact: '',
  notes: '',
};
export function stageBranch(stages: Stage[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let depth = 0; depth < 32; depth++) {
    const size = ids.size;
    stages.forEach((s) => {
      if (s.parentId && ids.has(s.parentId)) ids.add(s.id);
    });
    if (size === ids.size) break;
  }
  return ids;
}
