import type { ComponentType } from 'react';
import type { DataSource } from '../api/source';
import type { Project, Stage } from '../domain/models';
import type { Catalog } from '../domain/catalog';
import type { CatalogProfile } from '../domain/catalogInspection';
import type { InspectionFrame } from '../domain/inspection';
export interface DemoExtension {
  initialObjectId: string;
  source: DataSource;
  Objects: ComponentType;
  Site: ComponentType<{ project: Project }>;
  Analytics: ComponentType<{ project: Project }>;
  Schedule: ComponentType<{ project: Project }>;
  Settings: ComponentType<{ project: Project }>;
  LegacyInspection: ComponentType<{ project?: Project }>;
  loadInspectionExample(
    objectId: string,
    catalog: Catalog,
    signal: AbortSignal,
  ): Promise<{
    frames: InspectionFrame[];
    plan: Stage[];
    profile: CatalogProfile;
  }>;
}
// Only the demo branch supplies this entry. URL/environment flags cannot create it.
const extensions = import.meta.glob<DemoExtension>('../demo/entry.ts', { eager: true, import: 'default' });
export const demoExtension = extensions['../demo/entry.ts'];
export const demoAvailable = !!demoExtension;
