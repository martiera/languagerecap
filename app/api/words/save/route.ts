import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isRegularItalianVerb } from '@/lib/italian-conjugation';
import { supportsLanguage } from '@/lib/languages';

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const user = await requireUser(request);
    const { words, targetLanguage, sourceLanguage = 'en', shortStory, title } = await request.json();
    if (!Array.isArray(words) || !words.length || typeof targetLanguage !== 'string' || !supportsLanguage(targetLanguage) || typeof sourceLanguage !== 'string' || !supportsLanguage(sourceLanguage) || sourceLanguage === targetLanguage) {
      return NextResponse.json({ error: 'Select words and two different supported languages.' }, { status: 400 });
    }
    await client.query('BEGIN');
    const lesson = await client.query(
      'INSERT INTO lessons (user_id, language_code, title, raw_notes, short_story) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [user.id, targetLanguage, title || 'Untitled lesson', '', shortStory || ''],
    );
    let saved = 0;
    let skipped = 0;
    let savedConjugations = 0;
    let skippedConjugations = 0;
    for (const word of words) {
      if (!word || typeof word.targetText !== 'string' || typeof word.translation !== 'string') continue;
      const type = typeof word.type === 'string' && word.type.trim().toLowerCase() === 'phrase' ? 'phrase' : word.type || 'word';
      const irregular = type !== 'phrase' && (targetLanguage === 'it' ? Boolean(word.isIrregular) && !isRegularItalianVerb(word.targetText) : Boolean(word.isIrregular));
      const lexemeResult = await client.query(
        `INSERT INTO language_lexemes (language_code, target_text, grammatical_type, is_irregular, source)
         VALUES ($1,$2,$3,$4,'lesson_import')
         ON CONFLICT (language_code, normalized_target_text) DO UPDATE
         SET grammatical_type=EXCLUDED.grammatical_type,
             is_irregular=language_lexemes.is_irregular OR EXCLUDED.is_irregular,
             updated_at=NOW()
         RETURNING id`,
        [targetLanguage, word.targetText, type, irregular],
      );
      const lexemeId = lexemeResult.rows[0].id;
      const senseResult = await client.query(
        `INSERT INTO language_lexeme_senses (lexeme_id, source_language_code, translation, source)
         VALUES ($1,$2,$3,'lesson_import')
         ON CONFLICT (lexeme_id, source_language_code, normalized_translation) DO UPDATE
         SET updated_at=NOW()
         RETURNING id`,
        [lexemeId, sourceLanguage, word.translation],
      );
      const senseId = senseResult.rows[0].id;
      const mapping = await client.query(
        `INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, lexeme_id) DO UPDATE SET selected_sense_id=COALESCE(user_lexemes.selected_sense_id, EXCLUDED.selected_sense_id)
         RETURNING (xmax = 0) AS inserted`,
        [user.id, lexemeId, senseId],
      );
      if (mapping.rows[0].inserted) saved += 1;
      else skipped += 1;
      await client.query(
        `INSERT INTO lesson_lexemes (lesson_id, lexeme_id, sense_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (lesson_id, lexeme_id) DO UPDATE SET sense_id=COALESCE(lesson_lexemes.sense_id, EXCLUDED.sense_id)`,
        [lesson.rows[0].id, lexemeId, senseId],
      );
      const conjugationRows = irregular && Array.isArray(word.conjugations) ? word.conjugations : [];
      for (const conjugation of conjugationRows) {
        if (!conjugation || typeof conjugation.tense !== 'string' || typeof conjugation.person !== 'string' || typeof conjugation.form !== 'string') continue;
        const conjugationResult = await client.query(
          `INSERT INTO language_lexeme_conjugations (lexeme_id, tense, person, form, translation, source)
           VALUES ($1,$2,$3,$4,$5,'lesson_import')
           ON CONFLICT (lexeme_id, tense, person, form) DO UPDATE SET updated_at=NOW()
           RETURNING id, (xmax = 0) AS inserted`,
          [lexemeId, conjugation.tense, conjugation.person, conjugation.form, conjugation.translation || ''],
        );
        const conjugationId = conjugationResult.rows[0].id;
        await client.query(
          `INSERT INTO user_lexeme_conjugations (user_id, conjugation_id)
           VALUES ($1,$2)
           ON CONFLICT (user_id, conjugation_id) DO NOTHING`,
          [user.id, conjugationId],
        );
        if (conjugationResult.rows[0].inserted) savedConjugations += 1;
        else skippedConjugations += 1;
      }
    }
    await client.query('COMMIT');
    return NextResponse.json({ lessonId: lesson.rows[0].id, saved, skipped, savedConjugations, skippedConjugations });
  } catch (error) {
    if (error instanceof Response) return error;
    await client.query('ROLLBACK');
    console.error(error);
    return NextResponse.json({ error: 'Could not save the lesson.' }, { status: 500 });
  } finally {
    client.release();
  }
}
