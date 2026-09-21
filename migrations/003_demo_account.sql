ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO app_users (email, password_hash, is_demo)
VALUES ('demo@languagerecap.local', 'disabled-demo-password', TRUE)
ON CONFLICT (email) DO UPDATE SET is_demo=TRUE;

INSERT INTO language_lexemes (language_code, target_text, grammatical_type, is_irregular, source)
SELECT 'it', value.target_text, value.grammatical_type, FALSE, 'demo'
FROM (VALUES
  ('andare', 'verb'),
  ('essere', 'verb'),
  ('avere bisogno di', 'phrase'),
  ('la passeggiata', 'noun'),
  ('parlare', 'verb'),
  ('scrivere', 'verb'),
  ('leggere', 'verb'),
  ('la casa', 'noun'),
  ('finire', 'verb'),
  ('il lavoro', 'noun'),
  ('aprire', 'verb'),
  ('la lezione', 'noun'),
  ('scegliere', 'verb'),
  ('arrivare', 'verb'),
  ('la strada', 'noun'),
  ('partire', 'verb'),
  ('tornare', 'verb'),
  ('il tempo', 'noun'),
  ('aspettare', 'verb'),
  ('la stanza', 'noun')
) AS value(target_text, grammatical_type)
ON CONFLICT (language_code, normalized_target_text) DO NOTHING;

INSERT INTO language_lexeme_senses (lexeme_id, source_language_code, translation, source)
SELECT lexeme.id, 'en', value.translation, 'demo'
FROM (VALUES
  ('andare', 'to go'),
  ('essere', 'to be'),
  ('avere bisogno di', 'to need'),
  ('la passeggiata', 'the walk'),
  ('parlare', 'to speak'),
  ('scrivere', 'to write'),
  ('leggere', 'to read'),
  ('la casa', 'the house'),
  ('finire', 'to finish'),
  ('il lavoro', 'the work'),
  ('aprire', 'to open'),
  ('la lezione', 'the lesson'),
  ('scegliere', 'to choose'),
  ('arrivare', 'to arrive'),
  ('la strada', 'the street'),
  ('partire', 'to leave'),
  ('tornare', 'to return'),
  ('il tempo', 'the time'),
  ('aspettare', 'to wait'),
  ('la stanza', 'the room')
) AS value(target_text, translation)
JOIN language_lexemes lexeme ON lexeme.language_code='it' AND lexeme.normalized_target_text=LOWER(value.target_text);

INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id, mastery_level, next_review_at)
SELECT demo.id, lexeme.id, sense.id, 0, NOW()
FROM app_users demo
JOIN language_lexemes lexeme ON lexeme.language_code='it' AND lexeme.source='demo'
JOIN language_lexeme_senses sense ON sense.lexeme_id=lexeme.id AND sense.source_language_code='en'
WHERE demo.email='demo@languagerecap.local' AND demo.is_demo=TRUE
ON CONFLICT (user_id, lexeme_id) DO UPDATE
SET selected_sense_id=EXCLUDED.selected_sense_id;

INSERT INTO lessons (user_id, language_code, title, raw_notes, short_story)
SELECT demo.id, 'it', 'Demo vocabulary', '', 'A sample Italian lesson for exploring LanguageRecap.'
FROM app_users demo
WHERE demo.email='demo@languagerecap.local' AND demo.is_demo=TRUE
  AND NOT EXISTS (
    SELECT 1 FROM lessons lesson
    WHERE lesson.user_id=demo.id AND lesson.title='Demo vocabulary'
  );

INSERT INTO lesson_lexemes (lesson_id, lexeme_id, sense_id)
SELECT lesson.id, lexeme.id, sense.id
FROM lessons lesson
JOIN app_users demo ON demo.id=lesson.user_id AND demo.is_demo=TRUE
JOIN language_lexemes lexeme ON lexeme.language_code='it' AND lexeme.source='demo'
JOIN language_lexeme_senses sense ON sense.lexeme_id=lexeme.id AND sense.source_language_code='en'
WHERE lesson.title='Demo vocabulary'
ON CONFLICT (lesson_id, lexeme_id) DO NOTHING;
