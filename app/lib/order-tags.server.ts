export const ANALYTICS_TAG = "analytics-processed";

export function splitTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function hasAnalyticsTag(tags: string): boolean {
  return splitTags(tags).some(
    (tag) => tag.toLowerCase() === ANALYTICS_TAG.toLowerCase(),
  );
}

export function mergeAnalyticsTag(tags: string): string {
  if (hasAnalyticsTag(tags)) {
    return tags;
  }

  return [...splitTags(tags), ANALYTICS_TAG].join(", ");
}
