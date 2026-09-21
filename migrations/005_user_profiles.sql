ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);

INSERT INTO profiles (user_id, native_language_code, active_target_language_code)
SELECT id, 'en', 'it'
FROM app_users
WHERE NOT is_demo
  AND NOT EXISTS (SELECT 1 FROM profiles profile WHERE profile.user_id=app_users.id);
