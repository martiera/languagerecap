export const SRS_LIMITS = {
  defaultNewCardsPerDay: 15,
  defaultReviewsPerDay: 150,
  minNewCardsPerDay: 5,
  maxNewCardsPerDay: 30,
  minReviewsPerDay: 1,
  maxReviewsPerDay: 1000,
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
