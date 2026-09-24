export const SRS_LIMITS = {
  defaultNewCardsPerDay: 15,
  defaultReviewsPerDay: 150,
  minNewCardsPerDay: 5,
  maxNewCardsPerDay: 30,
  minReviewsPerDay: 1,
  maxReviewsPerDay: 1000,
  defaultLearnAheadMinutes: 20,
  minLearnAheadMinutes: 0,
  maxLearnAheadMinutes: 60,
} as const;

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function clampLearnAheadMinutes(value: number) {
  return Math.min(
    Math.max(value, SRS_LIMITS.minLearnAheadMinutes),
    SRS_LIMITS.maxLearnAheadMinutes,
  );
}
