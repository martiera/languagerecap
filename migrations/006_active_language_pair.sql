ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_source_language_code TEXT NOT NULL DEFAULT 'en';

UPDATE profiles
SET active_source_language_code = COALESCE(native_language_code, 'en')
WHERE active_source_language_code IS NULL OR active_source_language_code = '';
