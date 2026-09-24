ALTER TABLE user_lexemes
  ADD COLUMN IF NOT EXISTS srs_card_type TEXT NOT NULL DEFAULT 'recognition',
  ADD COLUMN IF NOT EXISTS srs_difficulty DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS srs_stability_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_state TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS srs_learning_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS srs_last_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS srs_reps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_lapses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_leech BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS srs_algorithm_version TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE user_lexemes
  DROP CONSTRAINT IF EXISTS user_lexemes_srs_card_type_check,
  DROP CONSTRAINT IF EXISTS user_lexemes_srs_state_check,
  ADD CONSTRAINT user_lexemes_srs_card_type_check
    CHECK (srs_card_type IN ('recognition', 'production', 'cloze')),
  ADD CONSTRAINT user_lexemes_srs_state_check
    CHECK (srs_state IN ('new', 'learning', 'review', 'relearning', 'suspended'));

UPDATE user_lexemes
SET
  srs_card_type = CASE WHEN srs_card_type = 'vocabulary' THEN 'recognition' ELSE srs_card_type END,
  srs_state = CASE WHEN mastery_level > 0 THEN 'review' ELSE 'new' END,
  srs_learning_step = 0,
  srs_due_at = next_review_at AT TIME ZONE 'UTC',
  srs_last_review_at = last_reviewed_at AT TIME ZONE 'UTC',
  srs_reps = GREATEST(mastery_level, 0),
  srs_stability_days = CASE GREATEST(mastery_level, 0)
    WHEN 0 THEN 0
    WHEN 1 THEN 1
    WHEN 2 THEN 3
    WHEN 3 THEN 7
    WHEN 4 THEN 16
    ELSE 35
  END
WHERE srs_algorithm_version = 'legacy-v1';

CREATE TABLE IF NOT EXISTS vocabulary_review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES user_lexemes(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  card_type TEXT NOT NULL DEFAULT 'recognition',
  user_answer TEXT,
  correct BOOLEAN NOT NULL,
  response_time_ms INTEGER,
  grade TEXT NOT NULL,
  state_before TEXT NOT NULL,
  state_after TEXT NOT NULL,
  interval_before_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  interval_after_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  algorithm_version TEXT NOT NULL,
  CONSTRAINT vocabulary_review_log_card_type_check CHECK (card_type IN ('recognition', 'production', 'cloze')),
  CONSTRAINT vocabulary_review_log_grade_check CHECK (grade IN ('again', 'hard', 'good', 'easy', 'manual', 'migration')),
  CONSTRAINT vocabulary_review_log_response_time_check CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  CONSTRAINT vocabulary_review_log_interval_check CHECK (interval_before_days >= 0 AND interval_after_days >= 0)
);

CREATE INDEX IF NOT EXISTS user_lexemes_srs_due_idx
  ON user_lexemes(user_id, srs_card_type, srs_due_at);

CREATE INDEX IF NOT EXISTS user_lexemes_srs_leech_idx
  ON user_lexemes(user_id, srs_leech)
  WHERE srs_leech = TRUE;

CREATE INDEX IF NOT EXISTS vocabulary_review_log_card_idx
  ON vocabulary_review_log(user_id, card_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS vocabulary_review_log_user_time_idx
  ON vocabulary_review_log(user_id, reviewed_at DESC);

INSERT INTO vocabulary_review_log (
  user_id,
  card_id,
  word_id,
  reviewed_at,
  card_type,
  user_answer,
  correct,
  response_time_ms,
  grade,
  state_before,
  state_after,
  interval_before_days,
  interval_after_days,
  algorithm_version
)
SELECT
  ul.user_id,
  ul.id,
  ul.lexeme_id,
  COALESCE(ul.srs_last_review_at, ul.created_at AT TIME ZONE 'UTC'),
  'recognition',
  NULL,
  ul.mastery_level > 0,
  NULL,
  'migration',
  'legacy',
  ul.srs_state,
  0,
  ul.srs_stability_days,
  'legacy-v1'
FROM user_lexemes ul
WHERE NOT EXISTS (
  SELECT 1
  FROM vocabulary_review_log log
  WHERE log.card_id = ul.id
    AND log.algorithm_version = 'legacy-v1'
    AND log.grade = 'migration'
);
