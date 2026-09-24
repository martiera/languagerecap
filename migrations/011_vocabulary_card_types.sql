ALTER TABLE user_lexemes
  ADD COLUMN IF NOT EXISTS srs_recognition_successes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS srs_production_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS srs_cloze_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_lexemes
  DROP CONSTRAINT IF EXISTS user_lexemes_srs_card_type_check,
  ADD CONSTRAINT user_lexemes_srs_card_type_check
    CHECK (srs_card_type IN ('recognition', 'production', 'cloze'));

UPDATE user_lexemes
SET srs_card_type = 'recognition'
WHERE srs_card_type = 'vocabulary';
