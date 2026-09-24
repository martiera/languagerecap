ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS srs_new_cards_per_day INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS srs_max_reviews_per_day INTEGER NOT NULL DEFAULT 150;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_srs_new_cards_per_day_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_srs_new_cards_per_day_check
        CHECK (srs_new_cards_per_day BETWEEN 5 AND 30);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_srs_max_reviews_per_day_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_srs_max_reviews_per_day_check
        CHECK (srs_max_reviews_per_day BETWEEN 1 AND 1000);
  END IF;
END $$;
