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

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  native_language_code TEXT NOT NULL DEFAULT 'en',
  active_target_language_code TEXT NOT NULL DEFAULT 'it'
);
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

CREATE TABLE IF NOT EXISTS lesson_lexemes (
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  lexeme_id UUID NOT NULL REFERENCES language_lexemes(id) ON DELETE CASCADE,
  sense_id UUID REFERENCES language_lexeme_senses(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lesson_id, lexeme_id)
);

CREATE INDEX IF NOT EXISTS lesson_lexemes_lexeme_idx
  ON lesson_lexemes(lexeme_id);

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
