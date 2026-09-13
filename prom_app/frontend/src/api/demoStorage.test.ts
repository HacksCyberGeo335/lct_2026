import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { source } from './source';
import { demoStoragePrefix, resetDemoPlan } from './demoStorage';
import { projects } from '../demo/data';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
const signal = () => new AbortController().signal;
describe('local data isolation', () => {
  it('keeps the registry and other plans available when one saved plan is corrupt', async () => {
    localStorage.setItem(demoStoragePrefix + 'plan:north-park', '{broken');
    const items = await source('demo').objects(signal());
    expect(items).toHaveLength(6);
    expect(items[0].planError).toContain('повреждены');
    expect(items[0].stages).toEqual([]);
    expect(items[1].stages).toEqual(projects[1].stages);
    await expect(source('demo').report('north-park', 7, signal())).rejects.toThrow('повреждены');
  });
  it('recovers only the requested plan and preserves settings and unrelated data', () => {
    localStorage.setItem(demoStoragePrefix + 'plan:north-park', 'broken');
    localStorage.setItem(demoStoragePrefix + 'settings:north-park', 'settings');
    localStorage.setItem(demoStoragePrefix + 'plan:river-quarter', 'other-plan');
    localStorage.setItem('another-app', 'untouched');
    resetDemoPlan('north-park');
    expect(localStorage.getItem(demoStoragePrefix + 'plan:north-park')).toBeNull();
    expect(localStorage.getItem(demoStoragePrefix + 'settings:north-park')).toBe('settings');
    expect(localStorage.getItem(demoStoragePrefix + 'plan:river-quarter')).toBe('other-plan');
    expect(localStorage.getItem('another-app')).toBe('untouched');
  });
  it('reports denied storage access without losing object metadata', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const items = await source('demo').objects(signal());
    expect(items[0].name).toBe(projects[0].name);
    expect(items[0].planError).toContain('хранилище недоступно');
    await expect(source('demo').settings('north-park', signal())).rejects.toThrow('хранилище недоступно');
  });
  it('does not reuse the fixture forecast after a plan replacement', async () => {
    await source('demo').savePlan('north-park', [
      { ...projects[0].stages[0], plan: null, fact: null, actualStart: null, actualEnd: null },
    ]);
    const report = await source('demo').report('north-park', 7, signal());
    expect(report.project.forecast).toBeNull();
    expect(report.fact).toBeNull();
    expect(report.points).toEqual([]);
  });
});
