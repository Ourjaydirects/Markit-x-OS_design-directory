import { describe, expect, it } from 'vitest';
import { getResourceDateAdded, isNewResource } from '../is-new-resource';

describe('isNewResource', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');

  it('returns true for resources added within 7 days', () => {
    expect(isNewResource('2026-07-02T12:00:00.000Z', now)).toBe(true);
    expect(isNewResource('2026-07-08T12:00:00.000Z', now)).toBe(true);
  });

  it('returns false for resources older than 7 days', () => {
    expect(isNewResource('2026-06-30T12:00:00.000Z', now)).toBe(false);
  });

  it('returns false for invalid or empty dates', () => {
    expect(isNewResource('', now)).toBe(false);
    expect(isNewResource('not-a-date', now)).toBe(false);
  });

  it('returns false for future dates', () => {
    expect(isNewResource('2026-07-09T12:00:00.000Z', now)).toBe(false);
  });
});

describe('getResourceDateAdded', () => {
  it('reads dateAdded and common aliases', () => {
    expect(getResourceDateAdded({ dateAdded: '2026-07-01' })).toBe('2026-07-01');
    expect(getResourceDateAdded({ date_added: '2026-07-02' })).toBe('2026-07-02');
    expect(getResourceDateAdded({ addedAt: '2026-07-03' })).toBe('2026-07-03');
  });

  it('returns null when no date is present', () => {
    expect(getResourceDateAdded({})).toBeNull();
  });
});
