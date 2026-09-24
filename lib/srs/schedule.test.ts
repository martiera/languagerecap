import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSrsConfig, type VocabularyCardState } from './scheduler';
import { scheduleVocabularyCard } from './schedule';

const now = new Date('2026-09-24T09:00:00.000Z');
function card(overrides: Partial<VocabularyCardState> = {}): VocabularyCardState {
  return {
    cardType: 'recognition',
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

test('production selector uses ladder and continues beyond the final rung', () => {
  const config = { ...defaultSrsConfig, algorithm: 'ladder' as const, random: () => 0.5 };
  const next = scheduleVocabularyCard(card({ state: 'review', stability: 150 }), 'good', now, config);
  assert.equal(next.card.stability, 300);
  const capped = scheduleVocabularyCard(card({ state: 'review', stability: 300 }), 'good', now, config);
  assert.equal(capped.card.stability, 365);
});

test('production selector uses FSRS with real elapsed time and no application fuzz claim', () => {
  const config = { ...defaultSrsConfig, algorithm: 'fsrs' as const, random: () => 0 };
  const next = scheduleVocabularyCard(card({
    state: 'review',
    stability: 10,
    due: new Date('2026-09-20T09:00:00.000Z'),
    lastReview: new Date('2026-09-20T09:00:00.000Z'),
    reps: 4,
  }), 'good', now, config);
  assert.equal(next.appliedFuzzRatio, null);
  assert.equal(next.card.lastReview?.toISOString(), now.toISOString());
  assert.ok(next.card.stability > 0);
});

for (const algorithm of ['ladder', 'fsrs'] as const) {
  test(`${algorithm} production path handles early, on-time, and late reviews`, () => {
    const config = { ...defaultSrsConfig, algorithm };
    const first = scheduleVocabularyCard(card(), 'good', now, config).card;
    const second = scheduleVocabularyCard(first, 'good', first.due, config).card;
    const late = scheduleVocabularyCard({ ...second, due: new Date(second.due.getTime() - 86_400_000) }, 'good', now, config).card;
    assert.ok(first.due > now);
    assert.ok(second.due > first.due);
    assert.ok(['learning', 'review'].includes(late.state));
    assert.ok(late.stability > 0);
  });

  test(`${algorithm} production path handles lapse, leech, and learned scheduling`, () => {
    const config = { ...defaultSrsConfig, algorithm, random: Math.random };
    let current = card({ state: 'review', stability: 35, reps: 10 });
    current = scheduleVocabularyCard(current, 'again', now, config).card;
    assert.ok(current.lapses >= 1);
    for (let index = current.lapses; index < config.leechThreshold; index += 1) {
      current = scheduleVocabularyCard(current, 'again', now, config).card;
    }
    assert.equal(current.leech, true);
    const learned = scheduleVocabularyCard({ ...current, state: 'review', stability: config.learnedThresholdDays }, 'good', now, config).card;
    assert.equal(learned.state, 'review');
    assert.ok(learned.due > now);
  });
}
