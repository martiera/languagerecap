import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { supportsLanguage } from '@/lib/languages';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const requestedTarget = new URL(request.url).searchParams.get('language');
    if (requestedTarget && !supportsLanguage(requestedTarget)) {
      return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
    }

    const params = requestedTarget ? [user.id, requestedTarget] : [user.id];
    const targetFilter = requestedTarget ? ' AND pairs.target_language=$2' : '';
    const result = await pool.query(
      `WITH pairs AS (
         SELECT DISTINCT l.language_code AS target_language, s.source_language_code
         FROM user_lexemes ul
         JOIN language_lexemes l ON l.id=ul.lexeme_id
         JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
         WHERE ul.user_id=$1
       ),
       counts AS (
         SELECT pairs.source_language_code, pairs.target_language,
           (SELECT COUNT(*) FROM user_lexemes ul
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE ul.user_id=$1 AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code)::int AS words,
           (SELECT COUNT(DISTINCT lesson.id) FROM lessons lesson
            JOIN lesson_lexemes ll ON ll.lesson_id=lesson.id
            JOIN language_lexemes lesson_lexeme ON lesson_lexeme.id=ll.lexeme_id
            JOIN language_lexeme_senses lesson_sense
              ON lesson_sense.id=COALESCE(
                ll.sense_id,
                (SELECT ul_lesson.selected_sense_id
                 FROM user_lexemes ul_lesson
                 WHERE ul_lesson.user_id=$1 AND ul_lesson.lexeme_id=ll.lexeme_id)
              )
            WHERE lesson.user_id=$1
              AND lesson_lexeme.language_code=pairs.target_language
              AND lesson_sense.source_language_code=pairs.source_language_code)::int AS lessons,
           (SELECT COUNT(*) FROM user_lexemes ul
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE ul.user_id=$1 AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code
              AND ul.srs_state='review'
              AND ul.srs_stability_days >= 21)::int AS mastered,
           (SELECT COUNT(*) FROM user_lexemes ul
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE ul.user_id=$1 AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code
              AND ul.srs_state IN ('learning', 'relearning', 'review')
              AND ul.srs_due_at<=NOW())::int AS due,
           (SELECT COUNT(*) FROM user_lexemes ul
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE ul.user_id=$1 AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code
              AND ul.srs_state='new')::int AS "newAvailable",
           (SELECT COUNT(*) FROM vocabulary_review_log log
            JOIN user_lexemes ul ON ul.id=log.card_id
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE log.user_id=$1
              AND log.reviewed_at >= NOW() - INTERVAL '30 days'
              AND log.state_before='review'
              AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code
              AND log.correct)::int AS "retentionCorrect",
           (SELECT COUNT(*) FROM vocabulary_review_log log
            JOIN user_lexemes ul ON ul.id=log.card_id
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE log.user_id=$1
              AND log.reviewed_at >= NOW() - INTERVAL '30 days'
              AND log.state_before='review'
              AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code)::int AS "retentionTotal",
           (SELECT COALESCE(SUM(log.response_time_ms), 0) FROM vocabulary_review_log log
            JOIN user_lexemes ul ON ul.id=log.card_id
            JOIN language_lexemes l ON l.id=ul.lexeme_id
            JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
            WHERE log.user_id=$1
              AND l.language_code=pairs.target_language
              AND s.source_language_code=pairs.source_language_code)::bigint AS "timeSpentMs"
         FROM pairs
       )
       SELECT source_language_code AS "sourceLanguage",
              target_language AS "targetLanguage",
              words, lessons, mastered, due, "newAvailable",
              "retentionCorrect", "retentionTotal", "timeSpentMs"
       FROM counts
       WHERE words > 0${targetFilter}
       ORDER BY target_language, source_language_code
       LIMIT 50`,
      params,
    );

    return NextResponse.json({ pairs: result.rows });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not load statistics.' }, { status: 500 });
  }
}
