export type AnswerOptions = {
  diacriticsSensitive: boolean;
  typoTolerance: number;
  requireArticleGender: boolean;
};

function normalize(value: string, diacriticsSensitive: boolean) {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return diacriticsSensitive ? normalized : normalized.normalize('NFD').replace(/\p{M}/gu, '');
}

function distance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
}

function article(value: string) {
  return value.match(/^(der|die|das|den|dem|des|the|a|an|le|la|les|un|une|il|lo|la|i|gli|uno|una|un')\b/u)?.[1] || null;
}

export function checkAnswer(input: string, expected: string, options: AnswerOptions) {
  const actual = normalize(input, options.diacriticsSensitive);
  return expected.split('/').some((candidate) => {
    const answer = normalize(candidate, options.diacriticsSensitive);
    if (options.requireArticleGender && article(answer) && article(actual) !== article(answer)) return false;
    if (actual === answer) return true;
    return answer.length >= 4 && distance(actual, answer) <= options.typoTolerance;
  });
}
