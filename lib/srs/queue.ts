import type { SrsConfig, SrsState } from './scheduler';

export type QueueCard = {
  srsState: SrsState;
  srsDueAt: Date | string;
  srsDifficulty: number;
};

export type DailyQueueUsage = {
  reviewsToday: number;
  newToday: number;
};

export function isLessonRecapComplete(
  cards: readonly { srsState: SrsState; srsStability: number }[],
  learnedThresholdDays: number,
) {
  return cards.length > 0 && cards.every(card => card.srsState === 'review' && card.srsStability >= learnedThresholdDays);
}

export function selectStudyQueue<T extends QueueCard>(
  cards: readonly T[],
  usage: DailyQueueUsage,
  config: SrsConfig,
) {
  const reviewSlots = Math.max(0, config.maxReviewsPerDay - usage.reviewsToday);
  const newSlots = Math.max(0, config.maxNewCardsPerDay - usage.newToday);
  const sorted = [...cards].sort((left, right) => {
    const leftNew = left.srsState === 'new';
    const rightNew = right.srsState === 'new';
    if (leftNew !== rightNew) return leftNew ? 1 : -1;
    const dueDifference = new Date(left.srsDueAt).getTime() - new Date(right.srsDueAt).getTime();
    if (dueDifference !== 0) return dueDifference;
    return right.srsDifficulty - left.srsDifficulty;
  });
  let reviews = 0;
  let newCards = 0;
  return sorted.filter(card => {
    if (card.srsState === 'new') {
      if (newCards >= newSlots) return false;
      newCards += 1;
      return true;
    }
    if (reviews >= reviewSlots) return false;
    reviews += 1;
    return true;
  });
}

export function isDailySessionComplete(
  dueCardIds: readonly string[],
  failedCardIds: readonly string[],
  correctlyAnsweredCardIds: ReadonlySet<string>,
) {
  return dueCardIds.length === 0 && failedCardIds.every(cardId => correctlyAnsweredCardIds.has(cardId));
}

export function localDayKey(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
