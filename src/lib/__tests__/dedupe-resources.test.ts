import { describe, expect, it } from 'vitest';
import type { NormalizedResource } from '../../types/resource';
import { dedupeResources } from '../dedupe-resources';

function makeResource(overrides: Partial<NormalizedResource> & Pick<NormalizedResource, 'id' | 'name' | 'url'>): NormalizedResource {
  return {
    description: null,
    category: null,
    subCategory: null,
    pricing: null,
    featured: false,
    opensource: false,
    tags: null,
    count: null,
    tier: null,
    thumbnail: null,
    screenshot: null,
    gravityScore: 5,
    ...overrides,
  };
}

describe('dedupeResources', () => {
  it('removes duplicate entries by URL', () => {
    const resources = [
      makeResource({ id: 165, name: 'Kasbu', url: 'https://kasbu.bio/' }),
      makeResource({ id: 165, name: 'Kasbu', url: 'https://kasbu.bio/' }),
      makeResource({ id: 166, name: 'Other', url: 'https://example.com/' }),
    ];

    const result = dedupeResources(resources);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual([165, 166]);
  });

  it('treats URL casing and trailing spaces as duplicates', () => {
    const resources = [
      makeResource({ id: 1, name: 'A', url: 'https://Example.com' }),
      makeResource({ id: 2, name: 'B', url: 'https://example.com/ ' }),
    ];

    expect(dedupeResources(resources)).toHaveLength(1);
  });

  it('falls back to id when URL is missing', () => {
    const resources = [
      makeResource({ id: 10, name: 'No URL A', url: '' }),
      makeResource({ id: 10, name: 'No URL B', url: '' }),
      makeResource({ id: 11, name: 'No URL C', url: '' }),
    ];

    expect(dedupeResources(resources)).toHaveLength(2);
  });
});
