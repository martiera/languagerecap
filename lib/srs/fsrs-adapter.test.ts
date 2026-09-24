import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleCardWithFsrs } from './fsrs-adapter';
import { defaultSrsConfig, type VocabularyCardState } from './scheduler';

test('FSRS adapter preserves the scheduler card-state interface', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const card: VocabularyCardState = {
    cardType: 'recognition',
    difficulty: 5,
    stability: 0,
    baseInterval: 0,
    state: 'new',
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
    leech: false,
    learningStep: 0,
  };
  const next = scheduleCardWithFsrs(card, 'good', now, { ...defaultSrsConfig, random: () => 0.5 });
  assert.equal(next.cardType, 'recognition');
  assert.ok(next.due instanceof Date);
  assert.ok(next.stability > 0);
  assert.ok(next.reps > card.reps);
});

test('FSRS adapter maps the separate relearning steps', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const config = { ...defaultSrsConfig, algorithm: 'fsrs' as const, relearningStepsMinutes: [10] };
  const card: VocabularyCardState = {
    cardType: 'recognition',
    difficulty: 5,
    stability: 35,
    baseInterval: 35,
    state: 'review',
    due: now,
    lastReview: now,
    reps: 10,
    lapses: 0,
    leech: false,
    learningStep: 0,
  };
  const lapsed = scheduleCardWithFsrs(card, 'again', now, config);
  assert.equal(lapsed.state, 'relearning');
  const graduated = scheduleCardWithFsrs(lapsed, 'good', new Date(now.getTime() + 10 * 60_000), config);
  assert.equal(graduated.state, 'review');
});
