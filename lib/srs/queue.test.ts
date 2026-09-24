import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSrsConfig } from './scheduler';
import { isDailySessionComplete, isLessonRecapComplete, localDayKey, selectStudyQueue } from './queue';

const config = { ...defaultSrsConfig, random: () => 0.5 };
const due = new Date('2026-01-01T12:00:00.000Z');

test('queue applies separate daily caps for new cards and reviews', () => {
  const cards = [
    { id: 'overdue-hard', srsState: 'review' as const, srsDueAt: new Date('2025-12-01'), srsDifficulty: 9 },
    { id: 'overdue-easy', srsState: 'review' as const, srsDueAt: new Date('2025-12-01'), srsDifficulty: 2 },
    { id: 'new-one', srsState: 'new' as const, srsDueAt: due, srsDifficulty: 5 },
    { id: 'new-two', srsState: 'new' as const, srsDueAt: due, srsDifficulty: 4 },
  ];
  const selected = selectStudyQueue(cards, { reviewsToday: 149, newToday: 14 }, config);
  assert.deepEqual(selected.map(card => card.id), ['overdue-hard', 'new-one']);
});

test('session completion requires a correct retry for every failed card', () => {
  assert.equal(isDailySessionComplete([], ['a'], new Set()), false);
  assert.equal(isDailySessionComplete([], ['a'], new Set(['a'])), true);
  assert.equal(isDailySessionComplete(['a'], [], new Set()), false);
});

test('day keys follow the user time zone at UTC date boundaries', () => {
  assert.equal(localDayKey(new Date('2026-01-02T00:30:00.000Z'), 'America/New_York'), '2026-01-01');
  assert.equal(localDayKey(new Date('2026-01-02T05:00:00.000Z'), 'America/New_York'), '2026-01-02');
});

test('lesson recap completes when every lesson word has graduated from learning', () => {
  assert.equal(isLessonRecapComplete([{ srsState: 'review' }]), true);
  assert.equal(isLessonRecapComplete([{ srsState: 'review' }, { srsState: 'learning' }]), false);
  assert.equal(isLessonRecapComplete([{ srsState: 'review' }, { srsState: 'relearning' }]), false);
});

test('new words from a large lesson are spread by the daily new-card cap', () => {
  const lessonWords = Array.from({ length: 5 }, (_, index) => ({
    id: `lesson-${index}`,
    srsState: 'new' as const,
    srsDueAt: due,
    srsDifficulty: 5,
  }));
  const cappedConfig = { ...config, maxNewCardsPerDay: 2 };
  assert.equal(selectStudyQueue(lessonWords, { reviewsToday: 0, newToday: 0 }, cappedConfig).length, 2);
  assert.equal(selectStudyQueue(lessonWords, { reviewsToday: 0, newToday: 2 }, cappedConfig).length, 0);
  assert.equal(selectStudyQueue(lessonWords.slice(2), { reviewsToday: 0, newToday: 0 }, cappedConfig).length, 2);
});
