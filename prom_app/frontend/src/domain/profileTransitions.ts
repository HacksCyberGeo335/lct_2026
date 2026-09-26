import type { CatalogProfile } from './catalogInspection';
import type { Stage } from './models';

/** Operator edits invalidate confirmations whose context has changed. Imports are validated separately. */
export function editProfile(profile: CatalogProfile, patch: Partial<CatalogProfile>): CatalogProfile {
  const next = { ...profile, ...patch, kind: 'draft' as const };
  if (
    ['workId', 'stageId', 'planSource', 'zone', 'cameraId', 'start', 'end'].some(
      (key) => profile[key as keyof CatalogProfile] !== next[key as keyof CatalogProfile],
    )
  )
    next.coverage = 'unknown';
  if (profile.workId !== next.workId) {
    next.phases = [];
    next.conditions = {};
    next.alternatives = {};
  }
  if (
    profile.workId !== next.workId ||
    profile.modelId !== next.modelId ||
    profile.confidence !== next.confidence ||
    JSON.stringify(profile.supportedClasses) !== JSON.stringify(next.supportedClasses)
  )
    next.detectorValidated = false;
  return next;
}

export function profileForStage(profile: CatalogProfile, stageId: string, stage?: Stage): CatalogProfile {
  const patch: Partial<CatalogProfile> = { planSource: 'calendar', stageId };
  if (stage)
    Object.assign(patch, {
      zone: stage.zone,
      start: stage.start,
      end: stage.end,
      workId:
        stage.workId ||
        (profile.planSource === 'calendar' && profile.stageId === stageId ? profile.workId : ''),
    });
  if (Object.entries(patch).every(([key, value]) => profile[key as keyof CatalogProfile] === value))
    return profile;
  return editProfile(profile, patch);
}
