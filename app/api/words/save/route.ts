import { NextResponse } from 'next/server';
import { DEMO_USER_ID, pool } from '@/lib/db';
import { isRegularItalianVerb } from '@/lib/italian-conjugation';
import { supportsLanguage } from '@/lib/languages';
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { words, targetLanguage, shortStory, title } = await request.json();
    if (!Array.isArray(words) || !words.length || typeof targetLanguage !== 'string' || !supportsLanguage(targetLanguage)) return NextResponse.json({ error: 'Select at least one word and a supported target language.' }, { status: 400 });
    await client.query('BEGIN');
    const lesson = await client.query('INSERT INTO lessons (user_id, language_code, title, raw_notes, short_story) VALUES ($1,$2,$3,$4,$5) RETURNING id', [DEMO_USER_ID, targetLanguage, title || 'Untitled lesson', '', shortStory || '']);
    let saved = 0; let skipped = 0; let savedConjugations = 0; let skippedConjugations = 0;
    for (const word of words) {
      const existing = await client.query('SELECT id FROM words WHERE user_id=$1 AND language_code=$2 AND LOWER(BTRIM(target_text))=LOWER(BTRIM($3)) LIMIT 1', [DEMO_USER_ID, targetLanguage, word.targetText]);
      const wordId = existing.rows[0]?.id;
      if (wordId) skipped += 1;
      const type = typeof word.type === 'string' && word.type.trim().toLowerCase() === 'phrase' ? 'phrase' : word.type || 'word';
      const irregular = type !== 'phrase' && (targetLanguage === 'it' ? Boolean(word.isIrregular) && !isRegularItalianVerb(word.targetText) : Boolean(word.isIrregular));
      const savedWord = wordId ? wordId : (await client.query('INSERT INTO words (user_id, lesson_id, language_code, target_text, translation, grammatical_type, is_irregular) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [DEMO_USER_ID, lesson.rows[0].id, targetLanguage, word.targetText, word.translation, type, irregular])).rows[0].id;
      if (wordId && type === 'phrase') {
        await client.query('UPDATE words SET grammatical_type=$1, is_irregular=FALSE WHERE id=$2 AND user_id=$3', ['phrase', savedWord, DEMO_USER_ID]);
        await client.query('DELETE FROM word_conjugations WHERE word_id=$1 AND user_id=$2', [savedWord, DEMO_USER_ID]);
      }
      if (!wordId) saved += 1;
      const conjugationRows = irregular ? (Array.isArray(word.conjugations) ? word.conjugations : []) : [];
      for (const conjugation of conjugationRows) {
        const existingConjugation = await client.query('SELECT id FROM word_conjugations WHERE user_id=$1 AND language_code=$2 AND word_id=$3 AND LOWER(BTRIM(form))=LOWER(BTRIM($4)) AND LOWER(BTRIM(tense))=LOWER(BTRIM($5)) AND LOWER(BTRIM(person))=LOWER(BTRIM($6)) LIMIT 1', [DEMO_USER_ID, targetLanguage, savedWord, conjugation.form, conjugation.tense, conjugation.person]);
        if (existingConjugation.rows[0]) skippedConjugations += 1;
        else { await client.query('INSERT INTO word_conjugations (word_id, user_id, language_code, tense, person, form, translation) VALUES ($1,$2,$3,$4,$5,$6,$7)', [savedWord, DEMO_USER_ID, targetLanguage, conjugation.tense, conjugation.person, conjugation.form, conjugation.translation || '']); savedConjugations += 1; }
      }
    }
    await client.query('COMMIT'); return NextResponse.json({ lessonId: lesson.rows[0].id, saved, skipped, savedConjugations, skippedConjugations });
  } catch (error) { await client.query('ROLLBACK'); console.error(error); return NextResponse.json({ error: 'Could not save the lesson.' }, { status: 500 }); } finally { client.release(); }
}
