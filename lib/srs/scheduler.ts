export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';
export type SrsState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
export type SrsAlgorithm = 'fsrs' | 'ladder';

export type VocabularyCardState = {
  cardType: 'recognition' | 'production' | 'cloze';
  difficulty: number;
  stability: number;
  baseInterval: number;
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
  maxIntervalDays: number;
  random: () => number;
};

export const defaultSrsConfig: SrsConfig = {
  algorithm: 'ladder',
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
  maxNewCardsPerDay: SRS_LIMITS.defaultNewCardsPerDay,
  maxReviewsPerDay: SRS_LIMITS.defaultReviewsPerDay,
  maxIntervalDays: 365,
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
  const currentRung = config.longTermIntervalsDays.findIndex(
    interval => stability <= interval * (1 + config.fuzzRatio),
  );
  const currentIndex = currentRung === -1
    ? config.longTermIntervalsDays.length - 1
    : currentRung;
  return Math.min(currentIndex + skip, config.longTermIntervalsDays.length - 1);
}

function ladderInterval(card: VocabularyCardState, config: SrsConfig, skip: number) {
  const last = config.longTermIntervalsDays[config.longTermIntervalsDays.length - 1];
  if (card.baseInterval >= last) {
    return Math.min(config.maxIntervalDays, Math.max(last, card.baseInterval * 2 ** skip));
  }
  const index = nextLongTermIndex(card.baseInterval, config, skip);
  return config.longTermIntervalsDays[index];
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

export type ScheduleMetadata = {
  card: VocabularyCardState;
  appliedFuzzRatio: number | null;
};

function graduate(card: VocabularyCardState, now: Date, grade: SrsGrade, config: SrsConfig): ScheduleMetadata {
  const firstInterval = config.longTermIntervalsDays[0];
  const stability = fuzzInterval(
    firstInterval * (grade === 'easy' ? config.easyIntervalMultiplier : grade === 'hard' ? config.hardIntervalMultiplier : 1),
    config,
  );
  const next = {
    ...card,
    difficulty: nextDifficulty(card, grade, config),
    stability,
    baseInterval: firstInterval,
    state: 'review' as const,
    due: addDays(now, stability),
    lastReview: now,
    reps: card.reps + 1,
    leech: card.lapses >= config.leechThreshold,
    learningStep: 0,
  };
  return { card: next, appliedFuzzRatio: stability / (firstInterval * (grade === 'easy' ? config.easyIntervalMultiplier : grade === 'hard' ? config.hardIntervalMultiplier : 1)) - 1 };
}

export function scheduleCardWithMetadata({ card, grade, now, config }: ScheduleInput): ScheduleMetadata {
  if (grade === 'again') {
    const lapses = card.lapses + 1;
    const lapseRatio = config.lapseMinRatio
      + clamp(config.random(), 0, 1) * (config.lapseMaxRatio - config.lapseMinRatio);
    const baseInterval = card.state === 'review'
      ? Math.max(1, card.baseInterval * lapseRatio)
      : card.baseInterval;
    const stability = card.state === 'review'
      ? baseInterval
      : card.stability;
    return { card: {
      ...card,
      difficulty: nextDifficulty(card, grade, config),
      stability,
      baseInterval,
      state: card.state === 'review' ? 'relearning' : 'learning',
      due: now,
      lastReview: now,
      reps: card.reps + 1,
      lapses,
      leech: lapses >= config.leechThreshold,
      learningStep: 0,
    }, appliedFuzzRatio: null };
  }

  if (card.state !== 'review') {
    if (grade === 'easy' || card.learningStep >= config.learningStepsMinutes.length - 1) {
      return graduate(card, now, grade, config);
    }
    const nextStep = card.learningStep + 1;
    const minutes = config.learningStepsMinutes[nextStep];
    return { card: {
      ...card,
      difficulty: nextDifficulty(card, grade, config),
      state: 'learning',
      due: addMinutes(now, minutes),
      lastReview: now,
      reps: card.reps + 1,
      learningStep: nextStep,
      leech: card.lapses >= config.leechThreshold,
    }, appliedFuzzRatio: null };
  }

  const skip = grade === 'easy' ? 2 : 1;
  const baseInterval = ladderInterval(card, config, skip);
  const rawInterval = grade === 'hard'
    ? Math.max(card.baseInterval, baseInterval * config.hardIntervalMultiplier)
    : grade === 'easy'
      ? baseInterval * config.easyIntervalMultiplier
      : baseInterval;
  const stability = fuzzInterval(rawInterval, config);
  return { card: {
    ...card,
    difficulty: nextDifficulty(card, grade, config),
    stability,
    baseInterval,
    state: 'review',
    due: addDays(now, stability),
    lastReview: now,
    reps: card.reps + 1,
    leech: card.lapses >= config.leechThreshold,
  }, appliedFuzzRatio: stability / rawInterval - 1 };
}

export function scheduleCard(input: ScheduleInput): VocabularyCardState {
  return scheduleCardWithMetadata(input).card;
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
import { SRS_LIMITS } from './config';
