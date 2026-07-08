import resourcesData from './resources.json';
import type { NormalizedResource } from '../types/resource';
import { dedupeResources } from '../lib/dedupe-resources';

export const resources: NormalizedResource[] = dedupeResources(
  resourcesData as NormalizedResource[],
);
