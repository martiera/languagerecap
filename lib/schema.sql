CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
