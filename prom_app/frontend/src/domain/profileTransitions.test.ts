import { expect, it } from 'vitest';
import { emptyProfile, type CatalogProfile } from './catalogInspection';
import { editProfile, profileForStage } from './profileTransitions';
import { parseCsv, defaultMapping, validateRows } from '../features/import/csv';
const profile: CatalogProfile = {
  ...emptyProfile('site', 'catalog'),
  workId: 'work_047',
  zone: 'А',
  coverage: 'adequate',
  detectorValidated: true,
  phases: ['Разработка'],
  conditions: { method: 'excavator' },
  alternatives: { group: ['excavator'] },
};
it('invalidates coverage after a different zone, stage, camera or work and keeps confirmations for unrelated edits', () => {
  for (const patch of [{ zone: 'Б' }, { stageId: 'other' }, { cameraId: '2' }, { workId: 'work_048' }])
    expect(editProfile(profile, patch).coverage).toBe('unknown');
  expect(editProfile(profile, { zone: 'А' }).coverage).toBe('adequate');
  expect(editProfile(profile, { conditions: { method: 'other' } }).coverage).toBe('adequate');
  const next = editProfile(profile, { workId: 'work_048' });
  expect(next).toMatchObject({ phases: [], conditions: {}, alternatives: {}, detectorValidated: false });
  expect(profile.coverage).toBe('adequate');
});
it('invalidates model confirmation when its identity, threshold or supported classes change', () => {
  for (const patch of [{ modelId: 'new' }, { confidence: 0.8 }, { supportedClasses: ['crane'] }])
    expect(editProfile(profile, patch).detectorValidated).toBe(false);
});
it('resolves a routed stage from current plan data and never substitutes a missing stage', () => {
  const csv = parseCsv(
    'id,name,start,end,zone\na,Этап А,2026-08-01,2026-08-02,А\nb,Этап Б,2026-08-03,2026-08-04,Б',
  );
  const [a, b] = validateRows(csv, defaultMapping(csv.headers)).stages;
  const first = profileForStage(profile, a.id, a);
  const second = profileForStage(first, b.id, b);
  expect(profileForStage(second, a.id, a)).toMatchObject({ stageId: 'a', zone: 'А', start: a.start });
  expect(profileForStage(first, a.id, a)).toBe(first);
  expect(profileForStage(second, 'missing')).toMatchObject({ stageId: 'missing', coverage: 'unknown' });
});

it('does not carry a manually assigned work into an unrelated unbound calendar row', () => {
  const csv = parseCsv('id,name,start,end,zone\na,Этап,2026-08-01,2026-08-02,А');
  const [stage] = validateRows(csv, defaultMapping(csv.headers)).stages;
  expect(profileForStage(profile, 'a', stage).workId).toBe('');
  const assigned = { ...profile, planSource: 'calendar' as const, stageId: 'a' };
  expect(profileForStage(assigned, 'a', stage).workId).toBe('work_047');
});
