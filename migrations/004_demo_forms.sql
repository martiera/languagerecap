WITH demo_forms(target_text, tense, forms, translation) AS (
  VALUES
    ('andare', 'Present', ARRAY['vado','vai','va','andiamo','andate','vanno']::text[], 'to go'),
    ('andare', 'Passato prossimo', ARRAY['sono andato/a','sei andato/a','è andato/a','siamo andati/e','siete andati/e','sono andati/e']::text[], 'went'),
    ('andare', 'Imperfetto', ARRAY['andavo','andavi','andava','andavamo','andavate','andavano']::text[], 'used to go'),
    ('andare', 'Future', ARRAY['andrò','andrai','andrà','andremo','andrete','andranno']::text[], 'will go'),
    ('essere', 'Present', ARRAY['sono','sei','è','siamo','siete','sono']::text[], 'to be'),
    ('essere', 'Passato prossimo', ARRAY['sono stato/a','sei stato/a','è stato/a','siamo stati/e','siete stati/e','sono stati/e']::text[], 'was'),
    ('essere', 'Imperfetto', ARRAY['ero','eri','era','eravamo','eravate','erano']::text[], 'used to be'),
    ('essere', 'Future', ARRAY['sarò','sarai','sarà','saremo','sarete','saranno']::text[], 'will be'),
    ('parlare', 'Present', ARRAY['parlo','parli','parla','parliamo','parlate','parlano']::text[], 'to speak'),
    ('parlare', 'Passato prossimo', ARRAY['ho parlato','hai parlato','ha parlato','abbiamo parlato','avete parlato','hanno parlato']::text[], 'spoke'),
    ('parlare', 'Imperfetto', ARRAY['parlavo','parlavi','parlava','parlavamo','parlavate','parlavano']::text[], 'used to speak'),
    ('parlare', 'Future', ARRAY['parlerò','parlerai','parlerà','parleremo','parlerete','parleranno']::text[], 'will speak'),
    ('finire', 'Present', ARRAY['finisco','finisci','finisce','finiamo','finite','finiscono']::text[], 'to finish'),
    ('finire', 'Passato prossimo', ARRAY['ho finito','hai finito','ha finito','abbiamo finito','avete finito','hanno finito']::text[], 'finished'),
    ('finire', 'Imperfetto', ARRAY['finivo','finivi','finiva','finivamo','finivate','finivano']::text[], 'used to finish'),
    ('finire', 'Future', ARRAY['finirò','finirai','finirà','finiremo','finirete','finiranno']::text[], 'will finish')
),
people(person_index, person) AS (
  VALUES (1, 'io'), (2, 'tu'), (3, 'lui/lei'), (4, 'noi'), (5, 'voi'), (6, 'loro')
)
INSERT INTO language_lexeme_conjugations (
  lexeme_id, tense, person, form, translation, source
)
SELECT lexeme.id, demo_forms.tense, people.person, form.form, demo_forms.translation, 'demo'
FROM demo_forms
CROSS JOIN LATERAL unnest(demo_forms.forms) WITH ORDINALITY AS form(form, person_index)
JOIN people ON people.person_index=form.person_index
JOIN language_lexemes lexeme
  ON lexeme.language_code='it'
 AND lexeme.normalized_target_text=LOWER(demo_forms.target_text)
ON CONFLICT (lexeme_id, tense, person, form) DO NOTHING;

UPDATE user_lexemes
SET mastery_level=GREATEST(mastery_level, 4),
    next_review_at=NOW()
FROM app_users demo
JOIN language_lexemes lexeme
  ON lexeme.language_code='it' AND lexeme.source='demo'
WHERE user_lexemes.user_id=demo.id
  AND user_lexemes.lexeme_id=lexeme.id
  AND demo.email='demo@languagerecap.local'
  AND demo.is_demo=TRUE;

INSERT INTO user_lexeme_conjugations (
  user_id, conjugation_id, mastery_level, learning_level, next_review_at
)
SELECT demo.id, conjugation.id, 0,
       CASE conjugation.tense
         WHEN 'Present' THEN 1
         WHEN 'Passato prossimo' THEN 2
         WHEN 'Imperfetto' THEN 3
         WHEN 'Future' THEN 4
         ELSE 1
       END,
       NOW()
FROM app_users demo
JOIN language_lexemes lexeme
  ON lexeme.language_code='it' AND lexeme.source='demo'
JOIN language_lexeme_conjugations conjugation
  ON conjugation.lexeme_id=lexeme.id AND conjugation.source='demo'
WHERE demo.email='demo@languagerecap.local'
  AND demo.is_demo=TRUE
ON CONFLICT (user_id, conjugation_id) DO UPDATE
SET next_review_at=NOW();
