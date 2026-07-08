export const NEW_RESOURCE_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns true when a resource was added within the last 7 days.
 */
export function isNewResource(date: string, now: Date = new Date()): boolean {
  if (!date?.trim()) return false;

  const added = new Date(date);
  if (Number.isNaN(added.getTime())) return false;

  const diffMs = now.getTime() - added.getTime();
  if (diffMs < 0) return false;

  return diffMs <= NEW_RESOURCE_WINDOW_DAYS * MS_PER_DAY;
}

/**
 * Reads the added-date field from a resource, supporting common aliases.
 */
export function getResourceDateAdded(
  resource: { dateAdded?: string | null } & Record<string, unknown>,
): string | null {
  if (resource.dateAdded?.trim()) return resource.dateAdded;

  for (const key of ['date_added', 'addedAt', 'added_at', 'dateAdded']) {
    const value = resource[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return null;
}
