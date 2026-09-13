import { referenceObjects } from './reference';
import { CAPTURED, SNAPSHOT, day, isoDay, type Project, type Report, type Stage } from '../domain/models';

// Reference names and illustrative progress are retained; every fact shares one cutoff.
export const projects: Project[] = Object.entries(referenceObjects).map(([id, raw], index) => {
  const origin = day(
    index === 5
      ? '2026-10-01'
      : ['2026-06-01', '2026-03-01', '2026-02-01', '2026-04-01', '2026-08-01'][index],
  );
  const stages: Stage[] = raw.timeline.map((s, i) => {
    const start = isoDay(origin + i * 48),
      end = isoDay(origin + i * 48 + 56);
    const beforeCutoff = start <= SNAPSHOT;
    return {
      id: id + '-' + (i + 1),
      name: s.name,
      start,
      end,
      zone: 'Зона ' + String.fromCharCode(65 + i),
      equipment: i === 0 ? 'exc' : i === 1 ? 'mixer' : 'crane',
      quantity: i + 2,
      actualStart: beforeCutoff && s.fact > 0 ? start : null,
      actualEnd: s.fact === 100 && end <= SNAPSHOT ? end : null,
      plan: beforeCutoff ? s.plan : 0,
      fact: beforeCutoff ? s.fact : 0,
    };
  });
  const active = stages.find((s) => s.name === raw.stage) ?? stages[0];
  return {
    id,
    number: index + 1,
    name: raw.name,
    district: raw.district,
    permit: raw.permit,
    programme: raw.programme,
    status: raw.status,
    stage: active?.name ?? raw.stage,
    progress: raw.progress,
    cameras: raw.cams.map((camera, ci) => ({
      id: String(camera.id),
      name: camera.label,
      available: !(id === 'school-1517' && ci === 0),
      boxes: camera.boxes.map((box, bi) => ({
        id: id + '-' + camera.id + '-' + bi,
        cls: box.cls,
        confidence: Number(box.conf),
        x: box.x / 100,
        y: box.y / 100,
        width: box.w / 100,
        height: box.h / 100,
        trackId: id === 'ice-center' ? null : 'ТС-' + camera.id + (bi + 1),
        from: bi * 5,
        to: bi === 1 ? 35 : 61,
      })),
    })),
    stages,
    forecast: index >= 4 ? null : raw.kpi.forecast,
    updatedAt: CAPTURED,
    coverage: index === 5 ? null : index === 3 ? 42 : index === 4 ? 25 : 92,
  };
});

export function createReport(project: Project, period: number): Report {
  const current = project.stages.filter((s) => s.start <= SNAPSHOT && s.plan !== null && s.fact !== null);
  // Duration-weighted model example, never inferred from machine counts.
  const weight = current.reduce((sum, s) => sum + day(s.end) - day(s.start) + 1, 0);
  if (!weight)
    return {
      project,
      period,
      points: [],
      plan: null,
      fact: null,
      compliance: null,
      delta: null,
      generatedAt: new Date().toISOString(),
    };
  const total = (key: 'plan' | 'fact') =>
    weight
      ? current.reduce((sum, s) => sum + (s[key] ?? 0) * (day(s.end) - day(s.start) + 1), 0) / weight
      : 0;
  const count = Math.min(period, 7);
  const points = Array.from({ length: count }, (_, i) => {
    const daysAgo = Math.round((period - 1) * (1 - i / (count - 1)));
    return {
      date: isoDay(day(SNAPSHOT) - daysAgo),
      plan: Math.max(0, total('plan') - daysAgo * 0.65),
      fact: Math.max(0, total('fact') - daysAgo * (project.status === 'warn' ? 0.35 : 0.7)),
    };
  });
  const last = points[points.length - 1];
  return {
    project,
    period,
    points,
    plan: last.plan,
    fact: last.fact,
    compliance: last.plan ? Math.min(100, (last.fact / last.plan) * 100) : null,
    delta: last.fact - last.plan,
    generatedAt: new Date().toISOString(),
  };
}
export function projectWithStages(project: Project, stages: Stage[]) {
  const active = stages.find((s) => s.name === project.stage) ?? stages[0];
  return { ...project, stages, stage: active?.name ?? 'Нет этапов' };
}
