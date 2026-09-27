import { lazy } from 'react';
import type { DemoExtension } from '../app/demoExtension';
import { allRequirements, emptyProfile, type CatalogProfile } from '../domain/catalogInspection';
import { loadInspectionDemo } from '../api/inspectionDemo';
import { demoSource } from './source';
const extension: DemoExtension = {
  initialObjectId: 'north-park',
  source: demoSource,
  Objects: lazy(() => import('../pages/Objects').then((m) => ({ default: m.Objects }))),
  Site: lazy(() => import('../pages/Site').then((m) => ({ default: m.Site }))),
  Analytics: lazy(() => import('../pages/Analytics').then((m) => ({ default: m.Analytics }))),
  Schedule: lazy(() => import('../pages/Schedule').then((m) => ({ default: m.Schedule }))),
  Settings: lazy(() => import('../pages/Settings').then((m) => ({ default: m.Settings }))),
  LegacyInspection: lazy(() =>
    import('../pages/LegacyInspection').then((m) => ({ default: m.LegacyInspection })),
  ),
  async loadInspectionExample(objectId, catalog, signal) {
    const data = await loadInspectionDemo(signal);
    const p = emptyProfile(objectId, catalog.id),
      groups = allRequirements(catalog, 'work_047');
    const next: CatalogProfile = {
      ...p,
      workId: 'work_047',
      kind: 'demo',
      zone: 'А',
      start: '2026-08-01',
      end: '2026-08-31',
      phases: groups.map((g) => g.phase),
      conditions: { excavation_method: 'excavator', soil_transport: 'other' },
      alternatives: Object.fromEntries(groups.map((g) => [g.requirement_id, [g.one_of[0]]])),
      cameraId: '1',
      modelId: data.frames[0].result.model,
      coverage: 'adequate',
      detectorValidated: true,
      supportedClasses: ['excavator', 'dump_truck', 'crane'],
    };

    return { ...data, profile: next };
  },
};
export default extension;
