CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS ai_request_limits (
  scope_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_key, window_start)
);

CREATE INDEX IF NOT EXISTS ai_request_limits_updated_idx
  ON ai_request_limits (updated_at);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  native_language_code TEXT NOT NULL DEFAULT 'en',
  active_target_language_code TEXT NOT NULL DEFAULT 'it',
  active_source_language_code TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  srs_new_cards_per_day INTEGER NOT NULL DEFAULT 15,
  srs_max_reviews_per_day INTEGER NOT NULL DEFAULT 150
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_source_language_code TEXT NOT NULL DEFAULT 'en';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS srs_new_cards_per_day INTEGER NOT NULL DEFAULT 15;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS srs_max_reviews_per_day INTEGER NOT NULL DEFAULT 150;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS srs_diacritics_sensitive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS srs_typo_tolerance INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS srs_require_article_gender BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, language_code TEXT NOT NULL,
  title TEXT NOT NULL, raw_notes TEXT NOT NULL, short_story TEXT NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL, target_text TEXT NOT NULL, translation TEXT NOT NULL, grammatical_type TEXT NOT NULL DEFAULT 'word', is_irregular BOOLEAN NOT NULL DEFAULT FALSE,
  mastery_level INT NOT NULL DEFAULT 0, next_review_at TIMESTAMP NOT NULL DEFAULT NOW(), last_reviewed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS words_due_idx ON words(user_id, language_code, next_review_at);
ALTER TABLE words ADD COLUMN IF NOT EXISTS is_irregular BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS word_conjugations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, language_code TEXT NOT NULL, tense TEXT NOT NULL, person TEXT NOT NULL,
  form TEXT NOT NULL, translation TEXT NOT NULL DEFAULT '', mastery_level INT NOT NULL DEFAULT 0,
  next_review_at TIMESTAMP NOT NULL DEFAULT NOW(), last_reviewed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conjugations_due_idx ON word_conjugations(user_id, language_code, next_review_at);
CREATE INDEX IF NOT EXISTS word_conjugations_word_id_idx ON word_conjugations(word_id);
ALTER TABLE word_conjugations ADD COLUMN IF NOT EXISTS learning_level INT NOT NULL DEFAULT 1;

-- Shared language content. User mastery and review scheduling stay in the
-- mapping tables below so canonical entries can be reused safely.
CREATE TABLE IF NOT EXISTS language_lexemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT NOT NULL,
  target_text TEXT NOT NULL,
  normalized_target_text TEXT GENERATED ALWAYS AS (LOWER(BTRIM(target_text))) STORED,
  grammatical_type TEXT NOT NULL DEFAULT 'word',
  is_irregular BOOLEAN NOT NULL DEFAULT FALSE,
  editorial_status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  reviewed_at TIMESTAMP,
  updated_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT language_lexemes_status_check CHECK (editorial_status IN ('active', 'needs_review', 'archived')),
  CONSTRAINT language_lexemes_unique_text UNIQUE (language_code, normalized_target_text)
);

CREATE INDEX IF NOT EXISTS language_lexemes_language_idx
  ON language_lexemes(language_code);

CREATE TABLE IF NOT EXISTS language_lexeme_senses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lexeme_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  source_language_code TEXT NOT NULL,
  translation TEXT NOT NULL,
  normalized_translation TEXT GENERATED ALWAYS AS (LOWER(BTRIM(translation))) STORED,
  editorial_status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  reviewed_at TIMESTAMP,
  updated_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT language_lexeme_senses_status_check CHECK (editorial_status IN ('active', 'needs_review', 'archived')),
  CONSTRAINT language_lexeme_senses_unique_translation UNIQUE (lexeme_id, source_language_code, normalized_translation)
);

CREATE INDEX IF NOT EXISTS language_lexeme_senses_source_idx
  ON language_lexeme_senses(source_language_code);

CREATE TABLE IF NOT EXISTS user_lexemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lexeme_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  selected_sense_id UUID REFERENCES language_lexeme_senses(id) ON DELETE SET NULL,
  mastery_level INT NOT NULL DEFAULT 0,
  next_review_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMP,
  personal_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lexeme_id)
);

CREATE INDEX IF NOT EXISTS user_lexemes_due_idx
  ON user_lexemes(user_id, next_review_at);

ALTER TABLE user_lexemes
  ADD COLUMN IF NOT EXISTS srs_card_type TEXT NOT NULL DEFAULT 'recognition',
  ADD COLUMN IF NOT EXISTS srs_difficulty DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS srs_stability_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_base_interval_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_state TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS srs_learning_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS srs_last_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS srs_reps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_lapses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_leech BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS srs_algorithm_version TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS srs_recognition_successes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_production_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS srs_cloze_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_lexemes_srs_card_type_check'
  ) THEN
    ALTER TABLE user_lexemes
      ADD CONSTRAINT user_lexemes_srs_card_type_check
        CHECK (srs_card_type IN ('recognition', 'production', 'cloze'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_lexemes_srs_state_check'
  ) THEN
    ALTER TABLE user_lexemes
      ADD CONSTRAINT user_lexemes_srs_state_check
        CHECK (srs_state IN ('new', 'learning', 'review', 'relearning', 'suspended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_lexemes_srs_due_idx
  ON user_lexemes(user_id, srs_card_type, srs_due_at);

CREATE INDEX IF NOT EXISTS user_lexemes_srs_leech_idx
  ON user_lexemes(user_id, srs_leech)
  WHERE srs_leech = TRUE;

CREATE TABLE IF NOT EXISTS lesson_lexemes (
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  lexeme_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  sense_id UUID REFERENCES language_lexeme_senses(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lesson_id, lexeme_id)
);

CREATE INDEX IF NOT EXISTS lesson_lexemes_lexeme_idx
  ON lesson_lexemes(lexeme_id);

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
  base_interval_before_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_interval_after_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  algorithm_version TEXT NOT NULL,
  due_before TIMESTAMPTZ,
  due_after TIMESTAMPTZ,
  difficulty_before DOUBLE PRECISION,
  difficulty_after DOUBLE PRECISION,
  learning_step_before INTEGER,
  learning_step_after INTEGER,
  reps_before INTEGER,
  reps_after INTEGER,
  lapses_before INTEGER,
  lapses_after INTEGER,
  leech_before BOOLEAN,
  leech_after BOOLEAN,
  algorithm TEXT NOT NULL DEFAULT 'ladder',
  applied_fuzz_ratio DOUBLE PRECISION,
  answer_source TEXT NOT NULL DEFAULT 'typed',
  CONSTRAINT vocabulary_review_log_card_type_check CHECK (card_type IN ('recognition', 'production', 'cloze')),
  CONSTRAINT vocabulary_review_log_grade_check CHECK (grade IN ('again', 'hard', 'good', 'easy', 'manual', 'migration')),
  CONSTRAINT vocabulary_review_log_response_time_check CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  CONSTRAINT vocabulary_review_log_interval_check CHECK (interval_before_days >= 0 AND interval_after_days >= 0),
  CONSTRAINT vocabulary_review_log_base_interval_check CHECK (base_interval_before_days >= 0 AND base_interval_after_days >= 0)
);

CREATE INDEX IF NOT EXISTS vocabulary_review_log_card_idx
  ON vocabulary_review_log(user_id, card_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS vocabulary_review_log_user_time_idx
  ON vocabulary_review_log(user_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS language_lexeme_conjugations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lexeme_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  tense TEXT NOT NULL,
  person TEXT NOT NULL,
  form TEXT NOT NULL,
  translation TEXT NOT NULL DEFAULT '',
  editorial_status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  reviewed_at TIMESTAMP,
  updated_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT language_lexeme_conjugations_status_check CHECK (editorial_status IN ('active', 'needs_review', 'archived')),
  CONSTRAINT language_lexeme_conjugations_unique_form UNIQUE (lexeme_id, tense, person, form)
);

CREATE INDEX IF NOT EXISTS language_lexeme_conjugations_lexeme_idx
  ON language_lexeme_conjugations(lexeme_id);

CREATE TABLE IF NOT EXISTS user_lexeme_conjugations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conjugation_id UUID NOT NULL REFERENCES language_lexeme_conjugations(id) ON DELETE CASCADE,
  mastery_level INT NOT NULL DEFAULT 0,
  learning_level INT NOT NULL DEFAULT 1,
  next_review_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, conjugation_id)
);

CREATE INDEX IF NOT EXISTS user_lexeme_conjugations_due_idx
  ON user_lexeme_conjugations(user_id, next_review_at);
