ALTER TABLE user_lexemes
  ADD COLUMN IF NOT EXISTS introduced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mode_tier SMALLINT;

UPDATE user_lexemes ul
SET introduced_at = first_review.reviewed_at
FROM (
  SELECT card_id, MIN(reviewed_at) AS reviewed_at
  FROM vocabulary_review_log
  GROUP BY card_id
) AS first_review
WHERE ul.id = first_review.card_id
  AND ul.srs_state <> 'new'
  AND ul.introduced_at IS NULL;

UPDATE user_lexemes
SET mode_tier = CASE srs_card_type
  WHEN 'recognition' THEN 0
  WHEN 'production' THEN 2
  WHEN 'cloze' THEN 3
END
WHERE mode_tier IS NULL;

ALTER TABLE user_lexemes
  DROP CONSTRAINT IF EXISTS user_lexemes_mode_tier_check,
  ADD CONSTRAINT user_lexemes_mode_tier_check
    CHECK (mode_tier BETWEEN 0 AND 4);

ALTER TABLE user_lexemes
  ALTER COLUMN mode_tier DROP NOT NULL;

DROP INDEX IF EXISTS user_lexemes_mode_tier_idx;
