import { z } from 'zod';
import { stageSchema, type Stage, type EquipmentClass } from './models';

export interface ResourceRequirement {
  equipment: EquipmentClass;
  quantity: number;
}
export function resourcesOf(stage: Stage): ResourceRequirement[] {
  return (
    stage.resources ??
    (stage.equipment && stage.quantity !== null && stage.quantity > 0
      ? [{ equipment: stage.equipment, quantity: stage.quantity }]
      : [])
  );
}
export function validatePlan(stages: Stage[]): { id: string; message: string }[] {
  const issues: { id: string; message: string }[] = [];
  const byId = new Map(stages.map((s) => [s.id, s]));
  const parents = new Set(stages.map((s) => s.parentId).filter(Boolean));
  if (byId.size !== stages.length) issues.push({ id: '', message: 'ID этапов должны быть уникальны.' });
  for (const stage of stages) {
    const resources = resourcesOf(stage);
    if (new Set(resources.map((r) => r.equipment)).size !== resources.length)
      issues.push({ id: stage.id, message: 'Класс техники повторяется в требованиях этапа.' });
    if (parents.has(stage.id) && resources.length)
      issues.push({ id: stage.id, message: 'Ресурсы задаются у подэтапов, а не у сводного этапа.' });
    if (!stage.parentId) continue;
    const parent = byId.get(stage.parentId);
    if (!parent) issues.push({ id: stage.id, message: 'Родительский этап не найден: ' + stage.parentId });
    else if (stage.start < parent.start || stage.end > parent.end)
      issues.push({ id: stage.id, message: 'Период подэтапа выходит за период родителя.' });
    const visited = new Set([stage.id]);
    let current = parent;
    while (current) {
      if (visited.has(current.id) || visited.size >= 32) {
        issues.push({ id: stage.id, message: 'Цикл или более 32 уровней вложенности этапов.' });
        break;
      }
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return issues;
}
export const planSchema = z
  .array(stageSchema)
  .max(2000)
  .superRefine((stages, ctx) => {
    for (const issue of validatePlan(stages)) ctx.addIssue({ code: 'custom', message: issue.message });
  });
export function orderedStages(stages: Stage[]): { stage: Stage; depth: number; summary: boolean }[] {
  const children = new Map<string | null, Stage[]>();
  for (const stage of stages) {
    const parent = stage.parentId || null;
    children.set(parent, [...(children.get(parent) ?? []), stage]);
  }
  const rows: { stage: Stage; depth: number; summary: boolean }[] = [];
  const visit = (id: string | null, depth: number) => {
    if (depth >= 32) return;
    for (const stage of children.get(id) ?? []) {
      rows.push({ stage, depth, summary: children.has(stage.id) });
      visit(stage.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}
export function leafStages(stages: Stage[]) {
  const parents = new Set(stages.map((s) => s.parentId).filter(Boolean));
  return stages.filter((s) => !parents.has(s.id));
}
