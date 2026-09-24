ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS srs_diacritics_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS srs_typo_tolerance INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS srs_require_article_gender BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_srs_typo_tolerance_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_srs_typo_tolerance_check
        CHECK (srs_typo_tolerance BETWEEN 0 AND 2);
  END IF;
END $$;
