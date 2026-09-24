DO $$
DECLARE
  repair_user UUID;
BEGIN
  SELECT id
  INTO repair_user
  FROM app_users
  WHERE email = 'ieris@inbox.lv';

  IF repair_user IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO language_lexeme_senses (
    lexeme_id, source_language_code, translation, source
  )
  SELECT DISTINCT
    l.id, 'lv', selected_sense.translation, 'legacy_pair_repair'
  FROM user_lexemes ul
  JOIN language_lexemes l ON l.id = ul.lexeme_id
  JOIN language_lexeme_senses selected_sense ON selected_sense.id = ul.selected_sense_id
  WHERE ul.user_id = repair_user
    AND l.language_code = 'it'
    AND l.source = 'legacy_words'
    AND selected_sense.source_language_code = 'en'
  ON CONFLICT (lexeme_id, source_language_code, normalized_translation) DO NOTHING;

  UPDATE user_lexemes ul
  SET selected_sense_id = repaired.id
  FROM language_lexemes l,
       language_lexeme_senses selected_sense,
       language_lexeme_senses repaired
  WHERE ul.user_id = repair_user
    AND l.id = ul.lexeme_id
    AND selected_sense.id = ul.selected_sense_id
    AND repaired.lexeme_id = l.id
    AND repaired.source_language_code = 'lv'
    AND repaired.normalized_translation = selected_sense.normalized_translation
    AND l.language_code = 'it'
    AND l.source = 'legacy_words'
    AND selected_sense.source_language_code = 'en';

  UPDATE lesson_lexemes ll
  SET sense_id = repaired.id
  FROM lessons lesson,
       language_lexemes l,
       language_lexeme_senses selected_sense,
       language_lexeme_senses repaired
  WHERE lesson.id = ll.lesson_id
    AND lesson.user_id = repair_user
    AND l.id = ll.lexeme_id
    AND selected_sense.id = ll.sense_id
    AND repaired.lexeme_id = l.id
    AND repaired.source_language_code = 'lv'
    AND repaired.normalized_translation = selected_sense.normalized_translation
    AND l.language_code = 'it'
    AND l.source = 'legacy_words'
    AND selected_sense.source_language_code = 'en';

  UPDATE profiles
  SET active_source_language_code = 'lv',
      active_target_language_code = 'it'
  WHERE user_id = repair_user;
END $$;
