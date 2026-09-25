import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { defaultSrsConfig } from '@/lib/srs/scheduler';

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const user = await requireUser(request);
    if (user.isDemo) return NextResponse.json({ reset: 0 });
    const search = new URL(request.url).searchParams;
    const targetLanguage = search.get('targetLanguage') || search.get('language');
    const sourceLanguage = search.get('sourceLanguage');
    const params: string[] = [user.id];
    const pairFilter: string[] = [];
    if (targetLanguage) {
      params.push(targetLanguage);
      pairFilter.push(`l.language_code=$${params.length}`);
    }
    if (sourceLanguage) {
      params.push(sourceLanguage);
      pairFilter.push(`EXISTS (
        SELECT 1
        FROM language_lexeme_senses selected_sense
        WHERE selected_sense.id=ul.selected_sense_id
          AND selected_sense.source_language_code=$${params.length}
      )`);
    }
    const filter = pairFilter.length ? ` AND ${pairFilter.join(' AND ')}` : '';

    await client.query('BEGIN');
    const vocabularyCount = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM user_lexemes ul
       JOIN language_lexemes l ON l.id=ul.lexeme_id
       WHERE ul.user_id=$1${filter}`,
      params,
    );
    await client.query(
      `INSERT INTO vocabulary_review_log (
         user_id, card_id, word_id, card_type, user_answer, correct,
         grade, state_before, state_after, interval_before_days,
         interval_after_days, algorithm_version
       )
       SELECT
         ul.user_id, ul.id, ul.lexeme_id, 'recognition', 'restart', FALSE,
         'manual', ul.srs_state, 'new', ul.srs_stability_days,
         0, 'ladder-v1'
       FROM user_lexemes ul
       JOIN language_lexemes l ON l.id=ul.lexeme_id
       WHERE ul.user_id=$1${filter}`,
      params,
    );
    await client.query(
      `UPDATE user_lexemes ul
       SET mastery_level=0,
           next_review_at=NOW(),
           last_reviewed_at=NULL,
           srs_difficulty=${defaultSrsConfig.initialDifficulty},
           srs_stability_days=0,
           srs_state='new',
           srs_card_type='recognition',
           mode_tier=0,
           introduced_at=NULL,
           srs_learning_step=0,
           srs_due_at=NOW(),
           srs_last_review_at=NULL,
           srs_reps=0,
           srs_lapses=0,
           srs_leech=FALSE,
           srs_algorithm_version='ladder-v1',
           srs_recognition_successes=0,
           srs_production_unlocked=FALSE,
           srs_cloze_unlocked=FALSE
       FROM language_lexemes l
       WHERE ul.lexeme_id=l.id AND ul.user_id=$1${filter}`,
      params,
    );

    const formsParams: string[] = [user.id];
    const formsFilter = targetLanguage
      ? (() => {
          formsParams.push(targetLanguage);
          const sourceFilter = sourceLanguage
            ? (() => {
                formsParams.push(sourceLanguage);
                return ` AND s.source_language_code=$${formsParams.length}`;
              })()
            : '';
          return ` AND EXISTS (
            SELECT 1
            FROM language_lexeme_conjugations lc
            JOIN language_lexemes l ON l.id=lc.lexeme_id
            JOIN user_lexemes ul ON ul.lexeme_id=l.id AND ul.user_id=$1
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE lc.id=uc.conjugation_id
              AND l.language_code=$2${sourceFilter}
          )`;
        })()
      : '';
    await client.query(
      `UPDATE user_lexeme_conjugations uc
       SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL, learning_level=1
       WHERE uc.user_id=$1${formsFilter}`,
      formsParams,
    );
    await client.query('COMMIT');
    return NextResponse.json({ reset: Number(vocabularyCount.rows[0]?.count || 0) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not restart the review queue.' }, { status: 500 });
  } finally {
    client.release();
  }
}
