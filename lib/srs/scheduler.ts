export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';
export type SrsState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
export type SrsAlgorithm = 'fsrs' | 'ladder';

export type VocabularyCardState = {
  cardType: 'vocabulary';
  difficulty: number;
  stability: number;
  state: SrsState;
  due: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  leech: boolean;
  learningStep: number;
};

export type SrsConfig = {
  algorithm: SrsAlgorithm;
  learningStepsMinutes: readonly [number, number, number];
  longTermIntervalsDays: readonly number[];
  lapseMinRatio: number;
  lapseMaxRatio: number;
  fuzzRatio: number;
  learnedThresholdDays: number;
  leechThreshold: number;
  initialDifficulty: number;
  difficultyMin: number;
  difficultyMax: number;
  difficultyAgainDelta: number;
  difficultyHardDelta: number;
  difficultyEasyDelta: number;
  hardIntervalMultiplier: number;
  easyIntervalMultiplier: number;
  hardResponseTimeMs: number;
  easyResponseTimeMs: number;
  maxNewCardsPerDay: number;
  maxReviewsPerDay: number;
  random: () => number;
};

export const defaultSrsConfig: SrsConfig = {
  algorithm: 'fsrs',
  learningStepsMinutes: [0, 10, 180],
  longTermIntervalsDays: [1, 3, 7, 16, 35, 75, 150],
  lapseMinRatio: 0.3,
  lapseMaxRatio: 0.5,
  fuzzRatio: 0.05,
  learnedThresholdDays: 21,
  leechThreshold: 8,
  initialDifficulty: 5,
  difficultyMin: 1,
  difficultyMax: 10,
  difficultyAgainDelta: 0.8,
  difficultyHardDelta: 0.2,
  difficultyEasyDelta: 0.3,
  hardIntervalMultiplier: 0.8,
  easyIntervalMultiplier: 1.3,
  hardResponseTimeMs: 8_000,
  easyResponseTimeMs: 3_000,
  maxNewCardsPerDay: 15,
  maxReviewsPerDay: 150,
  random: Math.random,
};

export type ScheduleInput = {
  card: VocabularyCardState;
  grade: SrsGrade;
  now: Date;
  config: SrsConfig;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function fuzzInterval(interval: number, config: SrsConfig) {
  const random = clamp(config.random(), 0, 1);
  const offset = (random * 2 - 1) * config.fuzzRatio;
  return Math.max(Number.EPSILON, interval * (1 + offset));
}

function nextLongTermIndex(stability: number, config: SrsConfig, skip: number) {
  const index = config.longTermIntervalsDays.findIndex(interval => interval > stability);
  const firstFollowing = index === -1 ? config.longTermIntervalsDays.length - 1 : index;
  return Math.min(firstFollowing + skip, config.longTermIntervalsDays.length - 1);
}

function nextDifficulty(card: VocabularyCardState, grade: SrsGrade, config: SrsConfig) {
  const delta = grade === 'again'
    ? config.difficultyAgainDelta
    : grade === 'hard'
      ? config.difficultyHardDelta
      : grade === 'easy'
        ? -config.difficultyEasyDelta
        : 0;
  return clamp(card.difficulty + delta, config.difficultyMin, config.difficultyMax);
}

function graduate(card: VocabularyCardState, now: Date, grade: SrsGrade, config: SrsConfig) {
  const firstInterval = config.longTermIntervalsDays[0];
  const stability = fuzzInterval(
    firstInterval * (grade === 'easy' ? config.easyIntervalMultiplier : grade === 'hard' ? config.hardIntervalMultiplier : 1),
    config,
  );
  return {
    ...card,
    difficulty: nextDifficulty(card, grade, config),
    stability,
    state: 'review' as const,
    due: addDays(now, stability),
    lastReview: now,
    reps: card.reps + 1,
    leech: card.lapses >= config.leechThreshold,
    learningStep: 0,
  };
}

export function scheduleCard({ card, grade, now, config }: ScheduleInput): VocabularyCardState {
  if (grade === 'again') {
    const lapses = card.lapses + 1;
    const lapseRatio = config.lapseMinRatio
      + clamp(config.random(), 0, 1) * (config.lapseMaxRatio - config.lapseMinRatio);
    const stability = card.state === 'review'
      ? Math.max(Number.EPSILON, card.stability * lapseRatio)
      : card.stability;
    return {
      ...card,
      difficulty: nextDifficulty(card, grade, config),
      stability,
      state: card.state === 'review' ? 'relearning' : 'learning',
      due: now,
      lastReview: now,
      reps: card.reps + 1,
      lapses,
      leech: lapses >= config.leechThreshold,
      learningStep: 0,
    };
  }

  if (card.state !== 'review') {
    if (grade === 'easy' || card.learningStep >= config.learningStepsMinutes.length - 1) {
      return graduate(card, now, grade, config);
    }
    const nextStep = card.learningStep + 1;
    const minutes = config.learningStepsMinutes[nextStep];
    return {
      ...card,
      difficulty: nextDifficulty(card, grade, config),
      state: 'learning',
      due: addMinutes(now, minutes),
      lastReview: now,
      reps: card.reps + 1,
      learningStep: nextStep,
      leech: card.lapses >= config.leechThreshold,
    };
  }

  const skip = grade === 'easy' ? 2 : 1;
  const index = nextLongTermIndex(card.stability, config, skip - 1);
  const ladderInterval = config.longTermIntervalsDays[index];
  const rawInterval = grade === 'hard'
    ? Math.max(card.stability, ladderInterval * config.hardIntervalMultiplier)
    : grade === 'easy'
      ? ladderInterval * config.easyIntervalMultiplier
      : ladderInterval;
  const stability = fuzzInterval(rawInterval, config);
  return {
    ...card,
    difficulty: nextDifficulty(card, grade, config),
    stability,
    state: 'review',
    due: addDays(now, stability),
    lastReview: now,
    reps: card.reps + 1,
    leech: card.lapses >= config.leechThreshold,
  };
}

export function isLearned(card: VocabularyCardState, config: SrsConfig) {
  return card.state === 'review' && card.stability >= config.learnedThresholdDays;
}

export function inferGrade(correct: boolean, responseTimeMs: number | null | undefined, config: SrsConfig): SrsGrade {
  if (!correct) return 'again';
  if (responseTimeMs !== null && responseTimeMs !== undefined && responseTimeMs <= config.easyResponseTimeMs) return 'easy';
  if (responseTimeMs !== null && responseTimeMs !== undefined && responseTimeMs >= config.hardResponseTimeMs) return 'hard';
  return 'good';
}
