import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (user.isDemo) return NextResponse.json({ reset: 0 });
    const search = new URL(request.url).searchParams;
    const targetLanguage = search.get('targetLanguage') || search.get('language');
    const sourceLanguage = search.get('sourceLanguage');
    const pairFilter = targetLanguage && sourceLanguage ? ' AND l.language_code=$2 AND EXISTS (SELECT 1 FROM language_lexeme_senses s WHERE s.id=ul.selected_sense_id AND s.source_language_code=$3)' : targetLanguage ? ' AND l.language_code=$2' : '';
    const params = targetLanguage && sourceLanguage ? [user.id, targetLanguage, sourceLanguage] : targetLanguage ? [user.id, targetLanguage] : [user.id];
    const result = await pool.query(`WITH reset_words AS (UPDATE user_lexemes ul SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL FROM language_lexemes l WHERE ul.lexeme_id=l.id AND ul.user_id=$1${pairFilter} RETURNING ul.id), reset_forms AS (UPDATE user_lexeme_conjugations uc SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL WHERE uc.user_id=$1${targetLanguage ? ` AND EXISTS (SELECT 1 FROM language_lexeme_conjugations lc JOIN language_lexemes l ON l.id=lc.lexeme_id JOIN user_lexemes ul ON ul.lexeme_id=l.id AND ul.user_id=uc.user_id ${sourceLanguage ? 'JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id' : ''} WHERE lc.id=uc.conjugation_id AND l.language_code=$2${sourceLanguage ? ' AND s.source_language_code=$3' : ''})` : ''} RETURNING uc.id) SELECT (SELECT COUNT(*) FROM reset_words)::int + (SELECT COUNT(*) FROM reset_forms)::int AS reset`, params);
    return NextResponse.json({ reset: result.rows[0]?.reset ?? 0 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not restart the review queue.' }, { status: 500 });
  }
}