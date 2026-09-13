import { describe, it, expect } from 'vitest';
import { containRect, eventsAt, SNAPSHOT, day } from './models';
import { projects, createReport } from '../demo/data';
import { detectionsAt } from '../demo/observations';
import { readConfig } from '../shared/config';
import { source, UnsupportedError } from '../api/source';
describe('Domain and configuration', () => {
  it('keeps real mode honest and validates unknown modes', async () => {
    await expect(source('api').objects(new AbortController().signal)).rejects.toBeInstanceOf(
      UnsupportedError,
    );
    expect(() => readConfig({ VITE_APP_MODE: 'whatever' })).toThrow('demo или api');
    expect(readConfig({ VITE_APP_MODE: 'api', VITE_API_BASE_URL: 'https://api.example/api/' }).apiBase).toBe(
      'https://api.example/api',
    );
    expect(readConfig({ VITE_API_BASE_URL: 'http://localhost:8080' }).apiBase).toBe(
      'http://localhost:8080/api',
    );
  });
  it('contains wide and tall media with correct letterboxing', () => {
    expect(containRect(800, 600, 1600, 900)).toEqual({ x: 0, y: 75, width: 800, height: 450 });
    expect(containRect(800, 400, 900, 1600)).toEqual({ x: 287.5, y: 0, width: 225, height: 400 });
    expect(containRect(0, 400, 900, 1600).width).toBe(0);
  });
  it('rewinding removes future events and corresponding detections', () => {
    const boxes = projects[0].cameras[0].boxes;
    expect(detectionsAt(boxes, 15)).toHaveLength(3);
    expect(detectionsAt(boxes, 0)).toHaveLength(1);
    expect(eventsAt(boxes, 0)).toHaveLength(1);
    expect(eventsAt(boxes, 15).every((e) => e.time <= 15)).toBe(true);
  });
  it('has no future observed dates and matches KPI to the final chart point', () => {
    for (const p of projects) {
      for (const s of p.stages) {
        if (s.actualStart) expect(day(s.actualStart)).toBeLessThanOrEqual(day(SNAPSHOT));
        if (s.actualEnd) expect(day(s.actualEnd)).toBeLessThanOrEqual(day(SNAPSHOT));
      }
      const r = createReport(p, 7),
        last = r.points.at(-1);
      if (last) {
        expect(r.delta).toBe(last.fact - last.plan);
        expect(r.compliance).toBe(last.plan ? Math.min(100, (last.fact / last.plan) * 100) : null);
      }
    }
    expect(createReport({ ...projects[0], stages: [] }, 7).fact).toBeNull();
  });
  it('isolates local settings by object and API mode', async () => {
    localStorage.clear();
    const signal = new AbortController().signal,
      ds = source('demo');
    await ds.saveSettings('north-park', { deviations: false, cameras: false, weekly: true });
    expect((await ds.settings('north-park', signal)).weekly).toBe(true);
    expect((await ds.settings('river-quarter', signal)).weekly).toBe(false);
    await expect(source('api').settings('north-park', signal)).rejects.toBeInstanceOf(UnsupportedError);
  });
});
