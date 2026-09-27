import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCatalog } from './catalog';
import {
  allRequirements,
  emptyProfile,
  evaluateCatalog,
  validateProfile,
  type CatalogProfile,
} from './catalogInspection';
import { type InspectionFrame } from './inspection';
import { detectorClass } from './detectorClasses';
import { parseCsv, defaultMapping, validateRows } from '../features/import/csv';
const read = (name: string) =>
  JSON.parse(readFileSync(new URL('../../public/catalog/' + name, import.meta.url), 'utf8'));
export const catalog = parseCatalog(
  'construction-reviewed-2026-09-18',
  read('construction_work_cards.json'),
  read('construction_work_equipment.json'),
  read('construction_work_duration_review.json'),
);
describe('reviewed catalog', () => {
  it('loads the complete, internally consistent delivery', () => {
    expect(catalog.cards).toHaveLength(377);
    expect(catalog.equipmentById.size).toBe(127);
    expect(catalog.detectors.size).toBe(18);
    expect([...catalog.works.values()].every((w) => !w.cctv.automatic_absence_alert_enabled)).toBe(true);
  });
});

const demo = JSON.parse(readFileSync('tests/fixtures/inspection/manifest.json', 'utf8'));
const frame = (): InspectionFrame => structuredClone(demo.frames[0]);
function profile(workId = 'work_047'): CatalogProfile {
  const groups = allRequirements(catalog, workId);
  return {
    ...emptyProfile('site-a', catalog.id),
    workId,
    zone: 'А',
    start: '2026-08-01',
    end: '2026-08-31',
    phases: [...new Set(groups.map((g) => g.phase))],
    conditions: Object.assign({}, ...groups.map((g) => g.when)),
    alternatives: Object.fromEntries(groups.map((g) => [g.requirement_id, [g.one_of[0]]])),
    cameraId: '1',
    modelId: demo.frames[0].result.model,
    coverage: 'adequate',
    detectorValidated: true,
    supportedClasses: [...catalog.detectors.keys()],
  };
}
const assess = (p = profile(), f = frame()) => evaluateCatalog(catalog, p, [f], f);
describe('catalog observations', () => {
  it('checks independent functions without inventing quantities or alarms', () => {
    const result = assess();
    expect(result.groups.map((g) => g.state)).toEqual(['observed', 'not-observed']);
    expect(result.automaticAlertEnabled).toBe(false);
    expect(result.groups[0].explanation).toContain('этим не подтверждены');
    expect(result.groups[1].explanation).toContain('Один кадр');
  });
  it('stockpiling disables only the haulage condition; unknown method is inconclusive', () => {
    const p = profile();
    p.conditions.soil_transport = 'other';
    expect(assess(p).groups[1].state).toBe('not-applicable');
    delete p.conditions.excavation_method;
    expect(assess(p).groups[0].state).toBe('unknown');
  });
  it('requires an explicitly active phase and project alternatives', () => {
    const p = profile();
    p.phases = [];
    expect(assess(p).groups.every((g) => g.state === 'unknown')).toBe(true);
    p.phases = [allRequirements(catalog, p.workId)[0].phase];
    p.alternatives = {};
    expect(assess(p).groups.map((g) => g.state)).toEqual(['unknown', 'inactive']);
  });
  it('treats alternatives as OR and does not assert absence of unobservable tools', () => {
    const p = profile('work_068'),
      groups = allRequirements(catalog, p.workId);
    expect(groups.length).toBeGreaterThan(0);
    p.alternatives[groups[0].requirement_id] = groups[0].one_of;
    const f = frame();
    f.result!.detections[0].class_id = 'roller';
    expect(assess(p, f).groups[0].state).toBe('observed');
    f.result!.detections = [];
    expect(assess(p, f).groups[0].state).toBe('unknown');
  });
  it('does not evaluate aggregates even without plan children', () => {
    expect(assess(profile(catalog.cards.find((c) => c.row_kind === 'AGGREGATE')!.id)).groups).toEqual([]);
  });
  it.each(['unknown', 'occluded'] as const)('refuses unsupported coverage %s', (coverage) => {
    expect(assess({ ...profile(), coverage }).groups.every((g) => g.state === 'unknown')).toBe(true);
  });
  it('checks model capability and prevents unsupported classes from satisfying groups', () => {
    expect(assess({ ...profile(), detectorValidated: false }).groups[0].state).toBe('unknown');
    expect(assess({ ...profile(), supportedClasses: ['truck'] }).groups[0].state).toBe('unknown');
  });
  it('contains uncertainty to affected groups and preserves positive observations', () => {
    const f = frame();
    f.result!.detections.push({ ...f.result!.detections[0], id: 'unknown', class_id: 'new-machine' });
    expect(assess(profile(), f).groups.map((g) => g.state)).toEqual(['observed', 'unknown']);
    f.result!.detections[1].class_id = 'crane';
    f.result!.detections[1].confidence = 0.1;
    expect(assess(profile(), f).groups.map((g) => g.state)).toEqual(['observed', 'not-observed']);
    f.result!.detections[1].class_id = 'dump_truck';
    expect(assess(profile(), f).groups[1].state).toBe('unknown');
  });
  it('does not turn unlisted delivery equipment into a violation', () => {
    const f = frame();
    f.result!.detections[0].class_id = 'track_layer';
    expect(assess(profile(), f).unlisted).toContain('track_layer');
    expect(assess(profile(), f).automaticAlertEnabled).toBe(false);
  });
  it('rejects wrong zone, date, missing result, and stale calendar binding', () => {
    expect(assess({ ...profile(), cameraId: 'other' }).groups[0].state).toBe('unknown');
    expect(assess({ ...profile(), modelId: 'other-model' }).groups[0].state).toBe('unknown');
    expect(assess({ ...profile(), zone: 'Б' }).groups[0].state).toBe('unknown');
    expect(assess({ ...profile(), start: '2026-09-01', end: '' }).groups[0].state).toBe('unknown');
    const f = frame();
    f.result = null;
    expect(assess(profile(), f).groups[0].state).toBe('unknown');
    expect(evaluateCatalog(catalog, profile(), [frame()], frame(), 'План изменился').groups[0].state).toBe(
      'unknown',
    );
  });
  it('counts separate instants, one camera and boundary gaps in Moscow time', () => {
    const p = {
      ...profile(),
      observationMode: 'window' as const,
      cameraId: '1',
      windowStart: '2026-08-25T14:00',
      windowEnd: '2026-08-25T14:10',
      minFrames: 2,
      maxGapMinutes: 6,
    };
    const frames = [frame(), frame()];
    frames[0].id = 'a';
    frames[1].id = 'b';
    frames[0].result!.captured_at = '2026-08-25T11:01:00Z';
    frames[1].result!.captured_at = '2026-08-25T14:09:00+03:00';
    expect(evaluateCatalog(catalog, p, frames).issues).toContain(
      'Есть непокрытый перерыв в наблюдениях, включая границы интервала.',
    );
    p.maxGapMinutes = 8;
    expect(evaluateCatalog(catalog, p, frames).issues).toEqual([]);
    expect(evaluateCatalog(catalog, p, frames).automaticAlertEnabled).toBe(false);
    frames[1].result!.captured_at = frames[0].result!.captured_at;
    expect(evaluateCatalog(catalog, p, frames).issues).toContain('Недостаточно разных моментов наблюдения.');
    frames[1].result!.camera_id = '2';
    expect(evaluateCatalog(catalog, p, frames).observations).toHaveLength(1);
  });
  it('treats unprocessed or unusable in-window results as incomplete coverage', () => {
    const p = {
      ...profile(),
      observationMode: 'window' as const,
      cameraId: '1',
      windowStart: '2026-08-25T14:00',
      windowEnd: '2026-08-25T15:00',
      minFrames: 2,
      maxGapMinutes: 30,
    };
    const f = frame();
    f.result!.quality.usable = false;
    expect(evaluateCatalog(catalog, p, [f]).issues).toContain(
      'В интервале есть непригодные или незавершённые результаты.',
    );
    expect(evaluateCatalog(catalog, { ...p, minFrames: -1 }, [f]).issues[0]).toContain('некорректные');
  });
  it('validates profile versions, site, foreign references and impossible dates', () => {
    for (const p of [
      { ...profile(), catalogId: 'old' },
      { ...profile(), siteId: 'site-b' },
      { ...profile(), phases: ['wrong'] },
      { ...profile(), alternatives: { bad: ['bad'] } },
      { ...profile(), conditions: { soil_transport: 'typo' } },
      { ...profile(), windowStart: '2026-02-30T12:00' },
    ])
      expect(() => validateProfile(p, catalog, 'site-a')).toThrow();
    expect(validateProfile(profile(), catalog, 'site-a')).toEqual(profile());
  });
  it('supports old and canonical detector IDs without changing raw observations', () => {
    expect(detectorClass('manipulator')).toBe('crane');
    expect(detectorClass('mixer')).toBe('concrete_mixer_truck');
    expect(detectorClass('constructor')).toBe('constructor');
    const f = frame();
    f.result!.detections[0].class_id = 'excavator';
    expect(assess(profile(), f).groups[0].state).toBe('observed');
    expect(f.result!.detections[0].class_id).toBe('excavator');
  });
  it('keeps separate plan instance IDs and validates paired catalog references', () => {
    const text =
      'id,name,start,end,zone,work_id,catalog_id\na,Котлован,2026-08-01,2026-08-31,А,work_047,' +
      catalog.id +
      '\nb,Котлован,2026-09-01,2026-09-30,Б,work_047,' +
      catalog.id;
    const input = parseCsv(text),
      result = validateRows(input, defaultMapping(input.headers));
    expect(result.errors).toEqual([]);
    expect(result.stages.map((s) => s.id)).toEqual(['a', 'b']);
    const bad = parseCsv(text.replaceAll(catalog.id, ''));
    expect(validateRows(bad, defaultMapping(bad.headers)).errors).toHaveLength(2);
  });
  it('retains source units and missing duration rather than assigning zero', () => {
    expect([...catalog.durationWorks.values()].filter((w) => !w.benchmarks.length)).toHaveLength(243);
    expect(new Set([...catalog.benchmarks.values()].map((b) => b.unit)).size).toBeGreaterThan(1);
    expect([...catalog.durationWorks.values()].every((w) => w.verified_population_mean === null)).toBe(true);
  });
});
