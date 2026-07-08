import type { NormalizedResource } from '../types/resource';

function normalizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.endsWith('/') && trimmed.length > 1) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function getResourceDedupeKey(resource: NormalizedResource): string {
  const url = resource.url ? normalizeUrl(resource.url) : '';
  if (url) return `url:${url}`;
  return `id:${resource.id}`;
}

/**
 * Removes duplicate resources, keeping the first occurrence.
 * Uniqueness is determined by URL first, then id as fallback.
 */
export function dedupeResources(resources: NormalizedResource[]): NormalizedResource[] {
  const seen = new Set<string>();
  const deduped: NormalizedResource[] = [];

  for (const resource of resources) {
    const key = getResourceDedupeKey(resource);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(resource);
  }

  return deduped;
}
