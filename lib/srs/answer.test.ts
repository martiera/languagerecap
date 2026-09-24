import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAnswer } from './answer';

test('answer checking supports configured diacritics and typo tolerance', () => {
  assert.equal(checkAnswer('cafe', 'café', { diacriticsSensitive: false, typoTolerance: 0, requireArticleGender: false }), true);
  assert.equal(checkAnswer('cafe', 'café', { diacriticsSensitive: true, typoTolerance: 0, requireArticleGender: false }), false);
  assert.equal(checkAnswer('house', 'mouse', { diacriticsSensitive: true, typoTolerance: 1, requireArticleGender: false }), true);
});

test('answer checking can require matching article and gender', () => {
  const options = { diacriticsSensitive: true, typoTolerance: 0, requireArticleGender: true };
  assert.equal(checkAnswer('die Haus', 'das Haus', options), false);
  assert.equal(checkAnswer('das Haus', 'das Haus', options), true);
});

test('answer checking ignores punctuation and accepts slash-separated translations', () => {
  const options = { diacriticsSensitive: true, typoTolerance: 0, requireArticleGender: false };
  assert.equal(checkAnswer('conoscere?', 'conoscere', options), true);
  assert.equal(checkAnswer('pazīt', 'pazīt/zināt', options), true);
  assert.equal(checkAnswer('zināt.', 'pazīt / zināt', options), true);
  assert.equal(checkAnswer('sapere', 'pazīt/zināt', options), false);
});
