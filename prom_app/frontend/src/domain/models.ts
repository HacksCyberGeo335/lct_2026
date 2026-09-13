import { z } from 'zod';

export type Mode = 'demo' | 'api';
export type Status = 'ok' | 'warn' | 'idle';
export const equipmentClass = z.enum(['exc', 'dump', 'crane', 'mixer']);
export type EquipmentClass = z.infer<typeof equipmentClass>;
export const classes: Record<EquipmentClass, { label: string; plural: string; color: string }> = {
  exc: { label: 'Экскаватор', plural: 'Экскаваторы', color: '#0E5A53' },
  dump: { label: 'Самосвал', plural: 'Самосвалы', color: '#35618C' },
  crane: { label: 'Кран', plural: 'Краны', color: '#8B610E' },
  mixer: { label: 'Бетоносмеситель', plural: 'Бетоносмесители', color: '#77475F' },
};
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const date = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === s;
  }, 'Некорректная календарная дата');
export const stageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    start: dateSchema,
    end: dateSchema,
    zone: z.string(),
    equipment: equipmentClass.nullable(),
    quantity: z.number().int().nonnegative().nullable(),
    actualStart: dateSchema.nullable(),
    actualEnd: dateSchema.nullable(),
    plan: z.number().min(0).max(100).nullable(),
    fact: z.number().min(0).max(100).nullable(),
  })
  .refine((s) => s.start <= s.end, 'Начало позже окончания');
export type Stage = z.infer<typeof stageSchema>;
export const settingsSchema = z.object({
  deviations: z.boolean(),
  cameras: z.boolean(),
  weekly: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Camera {
  id: string;
  name: string;
  available: boolean;
  boxes: Detection[];
}
export interface Detection {
  id: string;
  cls: EquipmentClass;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  trackId: string | null;
  from: number;
  to: number;
}
export interface Track {
  id: string;
  points: { time: number; x: number; y: number }[];
}
export interface ObservationEvent {
  id: string;
  time: number;
  detection: Detection;
  kind: 'entered' | 'left';
}
export type ProcessingState = 'waiting' | 'running' | 'succeeded' | 'failed' | 'empty' | 'unsupported';
export interface Recording {
  id: string;
  name: string;
  cameraId: string | null;
  kind: 'synthetic' | 'synthetic-video' | 'video';
  url: string | null;
  capturedAt: string;
  duration: number;
  processing: ProcessingState;
}
export interface Project {
  id: string;
  number: number;
  name: string;
  district: string;
  permit: string;
  programme: string;
  status: Status;
  stage: string;
  progress: number;
  cameras: Camera[];
  stages: Stage[];
  forecast: string | null;
  updatedAt: string;
  coverage: number | null;
}
export interface ReportPoint {
  date: string;
  plan: number;
  fact: number;
}
export interface Report {
  project: Project;
  period: number;
  points: ReportPoint[];
  plan: number | null;
  fact: number | null;
  compliance: number | null;
  delta: number | null;
  generatedAt: string;
}
export interface Deviation {
  stage: Stage;
  delta: number | null;
  expected: number | null;
  observed: number | null;
  coverage: number | null;
  evidence: { cameraId: string; recordingId: string; time: number } | null;
}
export const SNAPSHOT = '2026-08-25';
export const CAPTURED = '2026-08-25T14:19:22+03:00';
export const statusNames: Record<Status, string> = { ok: 'В норме', warn: 'Риск срыва', idle: 'Не начато' };
export function stageStatus(stage: Stage): Status {
  return stage.fact === null || stage.fact === 0
    ? 'idle'
    : stage.fact - (stage.plan ?? 0) < -10
      ? 'warn'
      : 'ok';
}
export const formatDate = (s: string) => s.slice(0, 10).split('-').reverse().join('.');
export const formatNumber = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);
export const day = (date: string) => Date.parse(date + 'T00:00:00Z') / 86400000;
export const isoDay = (value: number) => new Date(value * 86400000).toISOString().slice(0, 10);
export const deltaText = (n: number | null) =>
  n === null ? 'Нет расчёта' : (n > 0 ? '+' : '') + formatNumber(n) + ' п.п.';
export function eventsAt(boxes: Detection[], time: number): ObservationEvent[] {
  return boxes
    .flatMap((detection) => [
      { id: detection.id + '-in', time: detection.from, detection, kind: 'entered' as const },
      { id: detection.id + '-out', time: detection.to, detection, kind: 'left' as const },
    ])
    .filter((e) => e.time <= time)
    .sort((a, b) => b.time - a.time);
}
/** Contain transform handles letterboxing; normalized detection coordinates are 0..1. */
export function containRect(width: number, height: number, sourceWidth: number, sourceHeight: number) {
  if (Math.min(width, height, sourceWidth, sourceHeight) <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    x: (width - sourceWidth * scale) / 2,
    y: (height - sourceHeight * scale) / 2,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}
