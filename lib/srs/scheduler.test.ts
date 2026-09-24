import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSrsConfig, isLearned, scheduleCard, type SrsConfig, type VocabularyCardState } from './scheduler';

const now = new Date('2026-01-01T12:00:00.000Z');
const config: SrsConfig = { ...defaultSrsConfig, random: () => 0.5 };

function card(overrides: Partial<VocabularyCardState> = {}): VocabularyCardState {
  return {
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
    ...overrides,
  };
}

test('learning steps schedule approximately ten minutes and three hours apart', () => {
  const stepTwo = scheduleCard({ card: card(), grade: 'good', now, config });
  assert.equal(stepTwo.state, 'learning');
  assert.equal(stepTwo.due.getTime(), now.getTime() + 10 * 60_000);
  const stepThree = scheduleCard({ card: stepTwo, grade: 'good', now: stepTwo.due, config });
  assert.equal(stepThree.due.getTime(), stepTwo.due.getTime() + 180 * 60_000);
});

test('the third learning success graduates the card', () => {
  const stepTwo = scheduleCard({ card: card(), grade: 'good', now, config });
  const stepThree = scheduleCard({ card: stepTwo, grade: 'good', now: stepTwo.due, config });
  const graduated = scheduleCard({ card: stepThree, grade: 'good', now: stepThree.due, config });
  assert.equal(graduated.state, 'review');
  assert.equal(graduated.stability, 1);
  assert.equal(graduated.due.getTime(), stepThree.due.getTime() + 86_400_000);
});

test('a learning failure returns to step one immediately', () => {
  const learning = scheduleCard({ card: card({ learningStep: 1, state: 'learning' }), grade: 'again', now, config });
  assert.equal(learning.state, 'learning');
  assert.equal(learning.learningStep, 0);
  assert.equal(learning.due.getTime(), now.getTime());
});

test('a review lapse returns to relearning and keeps a non-zero fraction of the interval', () => {
  const review = card({ state: 'review', stability: 35, due: now, learningStep: 0 });
  const lapsed = scheduleCard({ card: review, grade: 'again', now, config });
  assert.equal(lapsed.state, 'relearning');
  assert.equal(lapsed.stability, 14);
  assert.equal(lapsed.lapses, 1);
});

test('successful review follows the configured long-term ladder', () => {
  const next = scheduleCard({ card: card({ state: 'review', stability: 1 }), grade: 'good', now, config });
  assert.equal(next.stability, 3);
});

test('fuzz stays within the configured bounds', () => {
  const low = scheduleCard({ card: card({ state: 'review', stability: 1 }), grade: 'good', now, config: { ...config, random: () => 0 } });
  const high = scheduleCard({ card: card({ state: 'review', stability: 1 }), grade: 'good', now, config: { ...config, random: () => 1 } });
  assert.ok(Math.abs(low.stability - 2.85) < 1e-12);
  assert.ok(Math.abs(high.stability - 3.15) < 1e-12);
});

test('leech is flagged at the configured failure threshold', () => {
  const leech = scheduleCard({ card: card({ lapses: 7 }), grade: 'again', now, config });
  assert.equal(leech.leech, true);
});

test('learned status starts at the configured twenty-one-day threshold', () => {
  assert.equal(isLearned(card({ state: 'review', stability: 20.99 }), config), false);
  assert.equal(isLearned(card({ state: 'review', stability: 21 }), config), true);
});
