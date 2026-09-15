import { describe, it, expect } from 'vitest';
import manifest from '../../public/inspection/manifest.json';
import { analysisResultSchema, evaluateFrame, moscowDate, type InspectionFrame } from './inspection';
import { planSchema, resourcesOf } from './plan';
import { parseAnalysisResult } from '../api/analysisResult';
const plan = planSchema.parse(manifest.plan);
const frames = manifest.frames.map((f) => ({
  ...f,
  origin: 'demo' as const,
  result: analysisResultSchema.parse(f.result),
}));
const frame = (index = 0): InspectionFrame => structuredClone(frames[index]);
describe('image-to-plan assessment', () => {
  it('explains missing resources, unexpected equipment and a complete set independently of progress', () => {
    const missing = evaluateFrame(plan, frame())[0];
    expect(missing.status).toBe('warning');
    expect(missing.resources).toEqual([
      { classId: 'exc', expected: 1, observed: 1 },
      { classId: 'dump', expected: 2, observed: 0 },
    ]);
    expect(missing.reason).toContain('Самосвалы');
    const unexpected = evaluateFrame(plan, frame(1))[0];
    expect(unexpected.unexpected).toEqual([{ classId: 'crane', count: 1 }]);
    expect(evaluateFrame(plan, frame(2))[0].status).toBe('ok');
  });
  it('does not attribute evidence across dates, zones or parent stages', () => {
    const results = evaluateFrame(plan, frame());
    expect(results.map((a) => a.stage.id)).toEqual(['pit', 'foundation', 'frame']);
    expect(results[1].status).toBe('other-zone');
    expect(results[2].status).toBe('inactive');
    expect(evaluateFrame(plan, frame(3))[1].status).toBe('ok');
    expect(moscowDate('2026-08-31T23:30:00Z')).toBe('2026-09-01');
  });
  it('keeps failed, pending, low-quality, unknown and low-confidence results inconclusive', () => {
    const f = frame();
    f.result = null;
    expect(evaluateFrame(plan, f)[0].status).toBe('insufficient');
    for (const state of ['waiting', 'running', 'failed'] as const) {
      const f = frame();
      f.result!.state = state;
      f.result!.detections = [];
      expect(evaluateFrame(plan, f)[0].status).toBe('insufficient');
    }
    const poor = frame();
    poor.result!.quality = { usable: false, reason: 'Не видна рабочая зона' };
    expect(evaluateFrame(plan, poor)[0].status).toBe('insufficient');
    const unknown = frame();
    unknown.result!.detections[0].class_id = 'new-equipment';
    expect(evaluateFrame(plan, unknown)[0].status).toBe('insufficient');
    const low = frame();
    low.result!.detections[0].confidence = 0.2;
    expect(evaluateFrame(plan, low)[0].status).toBe('insufficient');
  });
  it('uses an empty successful result as an observation, not as a processing failure', () => {
    const f = frame();
    f.result!.detections = [];
    const result = evaluateFrame(plan, f)[0];
    expect(result.status).toBe('warning');
    expect(result.resources.every((r) => r.observed === 0)).toBe(true);
  });
  it('allows resources required by simultaneous stages in the same zone', () => {
    const concurrent = { ...plan[3], start: '2026-08-01' };
    const results = evaluateFrame([...plan.slice(0, 3), concurrent], frame(1));
    expect(results[0].unexpected).toEqual([]);
    const onlyRequired = plan.map((s) => ({ ...s, rulePolicy: 'required-only' as const }));
    expect(evaluateFrame(onlyRequired, frame(1))[0].unexpected).toEqual([]);
  });
  it('does not call missing rules successful and ignores missing zones', () => {
    const noRule = plan.map((s) => (s.id === 'pit' ? { ...s, resources: [] } : s));
    expect(evaluateFrame(noRule, frame())[0].status).toBe('no-rule');
    const noZone = plan.map((s) => ({ ...s, zone: '' }));
    expect(evaluateFrame(noZone, frame())[0].status).toBe('other-zone');
    expect(resourcesOf({ ...plan[1], resources: undefined, equipment: 'exc', quantity: 0 })).toEqual([]);
  });
});
describe('analysis result boundary', () => {
  it('binds imported results to the exact file and native geometry', () => {
    const f = frame();
    expect(parseAnalysisResult(f.result, f).state).toBe('succeeded');
    expect(() => parseAnalysisResult(frame(1).result, f)).toThrow('другому снимку');
    expect(() => parseAnalysisResult({ ...f.result, image: { ...f.result!.image, width: 999 } }, f)).toThrow(
      'Размеры',
    );
  });
  it('rejects invalid boxes, impossible dates, duplicate IDs and inconsistent states', () => {
    const f = frame(1),
      result = f.result!;
    expect(analysisResultSchema.safeParse({ ...result, captured_at: '2026-02-30T10:00:00Z' }).success).toBe(
      false,
    );
    expect(analysisResultSchema.safeParse({ ...result, state: 'running' }).success).toBe(false);
    expect(
      analysisResultSchema.safeParse({ ...result, detections: [result.detections[0], result.detections[0]] })
        .success,
    ).toBe(false);
    expect(
      analysisResultSchema.safeParse({
        ...result,
        detections: [{ ...result.detections[0], bbox: [0.9, 0.1, 0.2, 0.2] }],
      }).success,
    ).toBe(false);
    expect(
      analysisResultSchema.safeParse({ ...result, quality: { usable: false, reason: '' } }).success,
    ).toBe(false);
  });
});
