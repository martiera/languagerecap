import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleCardWithFsrs } from './fsrs-adapter';
import { defaultSrsConfig, type VocabularyCardState } from './scheduler';

test('FSRS adapter preserves the scheduler card-state interface', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const card: VocabularyCardState = {
    cardType: 'vocabulary',
    difficulty: 5,
    stability: 0,
    state: 'new',
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
    leech: false,
    learningStep: 0,
  };
  const next = scheduleCardWithFsrs(card, 'good', now, { ...defaultSrsConfig, random: () => 0.5 });
  assert.equal(next.cardType, 'vocabulary');
  assert.ok(next.due instanceof Date);
  assert.ok(next.stability > 0);
  assert.ok(next.reps > card.reps);
});
