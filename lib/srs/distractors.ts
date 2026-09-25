export type DistractorCandidate = {
  text: string;
  partOfSpeech?: string;
  category?: string;
};

export type DistractorTier = 0 | 1 | 2;
export type DistractorBankLanguage = 'de' | 'lv';

const fallbackBank: Record<DistractorBankLanguage, DistractorCandidate[]> = {
  de: [
    { text: 'Haus', partOfSpeech: 'noun' },
    { text: 'Baum', partOfSpeech: 'noun' },
    { text: 'Buch', partOfSpeech: 'noun' },
    { text: 'Tisch', partOfSpeech: 'noun' },
    { text: 'laufen', partOfSpeech: 'verb' },
    { text: 'sehen', partOfSpeech: 'verb' },
    { text: 'machen', partOfSpeech: 'verb' },
    { text: 'kommen', partOfSpeech: 'verb' },
  ],
  lv: [
    { text: 'māja', partOfSpeech: 'noun' },
    { text: 'koks', partOfSpeech: 'noun' },
    { text: 'grāmata', partOfSpeech: 'noun' },
    { text: 'galds', partOfSpeech: 'noun' },
    { text: 'iet', partOfSpeech: 'verb' },
    { text: 'redzēt', partOfSpeech: 'verb' },
    { text: 'darīt', partOfSpeech: 'verb' },
    { text: 'nākt', partOfSpeech: 'verb' },
  ],
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function uniqueUsableCandidates(
  candidates: readonly DistractorCandidate[],
  targetWord: string,
) {
  const target = normalized(targetWord);
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalized(candidate.text);
    if (!key || key === target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectDistractors(
  targetWord: string,
  partOfSpeech: string,
  tier: DistractorTier,
  candidatePool: readonly DistractorCandidate[],
  maxCount = 3,
  language?: DistractorBankLanguage,
  random = Math.random,
) {
  const count = Math.max(0, Math.floor(maxCount));
  if (count === 0) return [];

  const usable = uniqueUsableCandidates(candidatePool, targetWord);
  const samePartOfSpeech = usable.filter(candidate => candidate.partOfSpeech === partOfSpeech);
  const eligible = tier === 0 ? usable : samePartOfSpeech;
  const bank = language ? fallbackBank[language] : [];
  const fallbackCandidates = uniqueUsableCandidates(
    tier === 0 ? bank : bank.filter(candidate => candidate.partOfSpeech === partOfSpeech),
    targetWord,
  );
  const source = eligible.length < 4
    ? uniqueUsableCandidates([...eligible, ...fallbackCandidates], targetWord)
    : eligible;

  if (tier === 2) {
    return [...source]
      .sort((left, right) => {
        const distance = editDistance(normalized(left.text), normalized(targetWord))
          - editDistance(normalized(right.text), normalized(targetWord));
        if (distance !== 0) return distance;
        return normalized(left.text).localeCompare(normalized(right.text));
      })
      .slice(0, count)
      .map(candidate => candidate.text);
  }

  return shuffle(source, random).slice(0, count).map(candidate => candidate.text);
}
