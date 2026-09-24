-- Run after lib/schema.sql. This migration is idempotent and preserves the
-- legacy tables until all application routes have been cut over.
INSERT INTO language_lexemes (
  language_code, target_text, grammatical_type, is_irregular, source
)
SELECT DISTINCT ON (language_code, LOWER(BTRIM(target_text)))
  language_code, target_text, grammatical_type, is_irregular, 'legacy_words'
FROM words
ORDER BY language_code, LOWER(BTRIM(target_text)), created_at, id
ON CONFLICT (language_code, normalized_target_text) DO UPDATE
SET grammatical_type = EXCLUDED.grammatical_type,
    is_irregular = language_lexemes.is_irregular OR EXCLUDED.is_irregular;

INSERT INTO language_lexeme_senses (
  lexeme_id, source_language_code, translation, source
)
SELECT DISTINCT ON (l.id, LOWER(BTRIM(w.translation)))
  l.id, COALESCE(p.native_language_code, 'en'), w.translation, 'legacy_words'
FROM words w
JOIN language_lexemes l
  ON l.language_code = w.language_code
 AND l.normalized_target_text = LOWER(BTRIM(w.target_text))
LEFT JOIN profiles p ON p.user_id = w.user_id
WHERE NULLIF(BTRIM(w.translation), '') IS NOT NULL
ORDER BY l.id, LOWER(BTRIM(w.translation)), w.created_at, w.id
ON CONFLICT (lexeme_id, source_language_code, normalized_translation) DO NOTHING;

INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id, mastery_level, next_review_at, last_reviewed_at)
SELECT w.user_id, l.id, s.id, MAX(w.mastery_level),
       MIN(w.next_review_at), MAX(w.last_reviewed_at)
FROM words w
JOIN language_lexemes l
  ON l.language_code = w.language_code
 AND l.normalized_target_text = LOWER(BTRIM(w.target_text))
LEFT JOIN profiles p ON p.user_id = w.user_id
LEFT JOIN language_lexeme_senses s
  ON s.lexeme_id = l.id
 AND s.source_language_code = COALESCE(p.native_language_code, 'en')
 AND s.normalized_translation = LOWER(BTRIM(w.translation))
GROUP BY w.user_id, l.id, s.id
ON CONFLICT (user_id, lexeme_id) DO UPDATE
SET mastery_level = GREATEST(user_lexemes.mastery_level, EXCLUDED.mastery_level),
    next_review_at = LEAST(user_lexemes.next_review_at, EXCLUDED.next_review_at),
    last_reviewed_at = GREATEST(user_lexemes.last_reviewed_at, EXCLUDED.last_reviewed_at);

INSERT INTO lesson_lexemes (lesson_id, lexeme_id, sense_id)
SELECT w.lesson_id, l.id, s.id
FROM words w
JOIN language_lexemes l
  ON l.language_code = w.language_code
 AND l.normalized_target_text = LOWER(BTRIM(w.target_text))
LEFT JOIN profiles p ON p.user_id = w.user_id
LEFT JOIN language_lexeme_senses s
  ON s.lexeme_id = l.id
 AND s.source_language_code = COALESCE(p.native_language_code, 'en')
 AND s.normalized_translation = LOWER(BTRIM(w.translation))
ON CONFLICT (lesson_id, lexeme_id) DO UPDATE
SET sense_id = COALESCE(lesson_lexemes.sense_id, EXCLUDED.sense_id);

INSERT INTO language_lexeme_conjugations (
  lexeme_id, tense, person, form, translation, source
)
SELECT DISTINCT ON (l.id, wc.tense, wc.person, LOWER(BTRIM(wc.form)))
  l.id, wc.tense, wc.person, wc.form, wc.translation, 'legacy_word_conjugations'
FROM word_conjugations wc
JOIN words w ON w.id = wc.word_id
JOIN language_lexemes l
  ON l.language_code = w.language_code
 AND l.normalized_target_text = LOWER(BTRIM(w.target_text))
ORDER BY l.id, wc.tense, wc.person, LOWER(BTRIM(wc.form)), wc.created_at, wc.id
ON CONFLICT (lexeme_id, tense, person, form) DO NOTHING;

INSERT INTO user_lexeme_conjugations (
  user_id, conjugation_id, mastery_level, learning_level, next_review_at, last_reviewed_at
)
SELECT wc.user_id, lc.id, wc.mastery_level, wc.learning_level,
       wc.next_review_at, wc.last_reviewed_at
FROM word_conjugations wc
JOIN words w ON w.id = wc.word_id
JOIN language_lexemes l
  ON l.language_code = w.language_code
 AND l.normalized_target_text = LOWER(BTRIM(w.target_text))
JOIN language_lexeme_conjugations lc
  ON lc.lexeme_id = l.id
 AND lc.tense = wc.tense
 AND lc.person = wc.person
 AND LOWER(BTRIM(lc.form)) = LOWER(BTRIM(wc.form))
ON CONFLICT (user_id, conjugation_id) DO UPDATE
SET mastery_level = GREATEST(user_lexeme_conjugations.mastery_level, EXCLUDED.mastery_level),
    learning_level = GREATEST(user_lexeme_conjugations.learning_level, EXCLUDED.learning_level),
    next_review_at = LEAST(user_lexeme_conjugations.next_review_at, EXCLUDED.next_review_at),
    last_reviewed_at = GREATEST(user_lexeme_conjugations.last_reviewed_at, EXCLUDED.last_reviewed_at);
