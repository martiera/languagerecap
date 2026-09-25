import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDistractors, type DistractorCandidate } from './distractors';

const target = { text: 'Haus', partOfSpeech: 'noun' };

test('tier 2 uses the German fallback bank when the usable same-part-of-speech pool is small', () => {
  const pool = [
    target,
    { text: 'Maus', partOfSpeech: 'noun' },
    { text: 'Haus', partOfSpeech: 'noun' },
    { text: 'laufen', partOfSpeech: 'verb' },
    { text: 'sehen', partOfSpeech: 'verb' },
  ];
  const result = selectDistractors(target.text, target.partOfSpeech!, 2, pool, 3, 'de', () => 0);
  assert.equal(result.length, 3);
  assert.ok(result.includes('Baum') || result.includes('Buch') || result.includes('Tisch'));
  assert.ok(!result.some(value => value.toLocaleLowerCase() === target.text.toLocaleLowerCase()));
});

test('tier 2 ranks a large pool by similarity', () => {
  const pool: DistractorCandidate[] = [
    { text: 'Maus', partOfSpeech: 'noun' },
    { text: 'Haus', partOfSpeech: 'noun' },
    { text: 'Haut', partOfSpeech: 'noun' },
    { text: 'Baum', partOfSpeech: 'noun' },
    ...Array.from({ length: 196 }, (_, index) => ({ text: `Wort-${index}`, partOfSpeech: 'noun' })),
  ];
  const result = selectDistractors(target.text, target.partOfSpeech!, 2, pool, 3, 'de');
  assert.deepEqual(result, ['Haut', 'Maus', 'Baum']);
});

test('exactly four usable same-part-of-speech candidates use the personal pool without fallback', () => {
  const pool = [
    { text: 'Maus', partOfSpeech: 'noun' },
    { text: 'Haut', partOfSpeech: 'noun' },
    { text: 'Baum', partOfSpeech: 'noun' },
    { text: 'Buch', partOfSpeech: 'noun' },
  ];
  const result = selectDistractors(target.text, target.partOfSpeech!, 1, pool, 3, 'de', () => 0);
  assert.equal(result.length, 3);
  assert.ok(result.every(value => pool.some(candidate => candidate.text === value)));
});

test('exactly three usable same-part-of-speech candidates trigger fallback', () => {
  const pool = [
    { text: 'Maus', partOfSpeech: 'noun' },
    { text: 'Haut', partOfSpeech: 'noun' },
    { text: 'Baum', partOfSpeech: 'noun' },
  ];
  const result = selectDistractors(target.text, target.partOfSpeech!, 1, pool, 3, 'de', () => 0);
  assert.equal(result.length, 3);
  assert.ok(result.some(value => !pool.some(candidate => candidate.text === value)));
});

test('never returns the correct answer or duplicates across randomized calls', () => {
  const pool: DistractorCandidate[] = [
    { text: 'Maus', partOfSpeech: 'noun' },
    { text: 'Haut', partOfSpeech: 'noun' },
    { text: 'Baum', partOfSpeech: 'noun' },
    { text: 'Buch', partOfSpeech: 'noun' },
    { text: 'laufen', partOfSpeech: 'verb' },
    { text: 'sehen', partOfSpeech: 'verb' },
  ];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const tier of [0, 1, 2] as const) {
      const result = selectDistractors(target.text, target.partOfSpeech!, tier, pool, 3, 'de');
      assert.equal(new Set(result.map(value => value.toLocaleLowerCase())).size, result.length);
      assert.ok(!result.some(value => value.toLocaleLowerCase() === target.text.toLocaleLowerCase()));
    }
  }
});
