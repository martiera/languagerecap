import { fsrs, Rating, State, type Grade } from 'ts-fsrs';
import type { SrsConfig, SrsGrade, VocabularyCardState } from './scheduler';

const stateNames = ['new', 'learning', 'review', 'relearning'] as const;
const fsrsStateNames = ['New', 'Learning', 'Review', 'Relearning'] as const;
const gradeRatings: Record<SrsGrade, Grade> = {
  again: Rating.Again as Grade,
  hard: Rating.Hard as Grade,
  good: Rating.Good as Grade,
  easy: Rating.Easy as Grade,
};

export function scheduleCardWithFsrs(
  card: VocabularyCardState,
  grade: SrsGrade,
  now: Date,
  config: SrsConfig,
): VocabularyCardState {
  const scheduler = fsrs({
    enable_fuzz: false,
    learning_steps: config.learningStepsMinutes.slice(1).map(minutes => `${minutes}m` as `${number}m`),
    relearning_steps: config.learningStepsMinutes.slice(1).map(minutes => `${minutes}m` as `${number}m`),
  });
  const result = scheduler.next({
    due: card.due,
    stability: card.stability,
    difficulty: card.state === 'new' ? 0 : card.difficulty,
    elapsed_days: card.lastReview ? Math.max(0, (now.getTime() - card.lastReview.getTime()) / 86_400_000) : 0,
    scheduled_days: card.stability,
    learning_steps: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    state: fsrsStateNames[card.state === 'suspended' ? State.Review : stateNames.indexOf(card.state as typeof stateNames[number])],
    last_review: card.lastReview ?? undefined,
  }, now, gradeRatings[grade]);
  const nextCard = result.card;
  const state = stateNames[nextCard.state] || 'review';
  const lapses = Math.max(nextCard.lapses, card.lapses + (grade === 'again' ? 1 : 0));
  return {
    ...card,
    difficulty: nextCard.difficulty,
    stability: nextCard.stability,
    state,
    due: nextCard.due,
    lastReview: nextCard.last_review || now,
    reps: nextCard.reps,
    lapses,
    leech: lapses >= config.leechThreshold,
    learningStep: nextCard.learning_steps,
  };
}
