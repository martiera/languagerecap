export type ReviewResult = { masteryLevel: number; nextReviewAt: Date };

export function calculateNextReview(isCorrect: boolean, currentLevel: number): ReviewResult {
  const now = new Date();
  const normalizedLevel = Number.isFinite(currentLevel) ? Math.min(Math.max(Math.trunc(currentLevel), 0), 5) : 0;
  if (!isCorrect) return { masteryLevel: 0, nextReviewAt: now };
  const masteryLevel = Math.min(normalizedLevel + 1, 5);
  const days = masteryLevel === 1 ? 1 : masteryLevel === 2 ? 2 : masteryLevel === 3 ? 7 : masteryLevel === 4 ? 14 : 30;
  const nextReviewAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return { masteryLevel, nextReviewAt };
}
