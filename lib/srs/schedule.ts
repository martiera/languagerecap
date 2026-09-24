import { scheduleCardWithFsrs } from './fsrs-adapter';
import { scheduleCardWithMetadata, type ScheduleMetadata, type SrsConfig, type SrsGrade, type VocabularyCardState } from './scheduler';

export function scheduleVocabularyCard(
  card: VocabularyCardState,
  grade: SrsGrade,
  now: Date,
  config: SrsConfig,
): ScheduleMetadata {
  if (config.algorithm === 'fsrs') {
    return { card: scheduleCardWithFsrs(card, grade, now, config), appliedFuzzRatio: null };
  }
  return scheduleCardWithMetadata({ card, grade, now, config });
}
