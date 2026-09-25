import { localDayKey } from './queue';

export const maxModeTier = 3;

export function normalizedModeTier(value: unknown) {
  if (value === null || value === undefined) return 0;
  const tier = Number(value);
  return Number.isInteger(tier) && tier >= 0 ? tier : 0;
}

export function hasFullLocalCalendarDayPassed(
  introducedAt: Date | string | null | undefined,
  currentTime: Date,
  timezone: string,
) {
  if (!introducedAt) return false;
  const introduced = new Date(introducedAt);
  if (Number.isNaN(introduced.getTime()) || Number.isNaN(currentTime.getTime())) return false;
  return localDayKey(introduced, timezone) < localDayKey(currentTime, timezone);
}
