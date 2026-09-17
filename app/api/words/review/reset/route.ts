import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const language = new URL(request.url).searchParams.get('language');
    const filter = language ? ' AND l.language_code=$2' : '';
    const params = language ? [user.id, language] : [user.id];
    const result = await pool.query(`WITH reset_words AS (UPDATE user_lexemes ul SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL FROM language_lexemes l WHERE ul.lexeme_id=l.id AND ul.user_id=$1${filter} RETURNING ul.id), reset_forms AS (UPDATE user_lexeme_conjugations uc SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL WHERE uc.user_id=$1${language ? ' AND EXISTS (SELECT 1 FROM language_lexeme_conjugations lc JOIN language_lexemes l ON l.id=lc.lexeme_id WHERE lc.id=uc.conjugation_id AND l.language_code=$2)' : ''} RETURNING uc.id) SELECT (SELECT COUNT(*) FROM reset_words)::int + (SELECT COUNT(*) FROM reset_forms)::int AS reset`, params);
    return NextResponse.json({ reset: result.rows[0]?.reset ?? 0 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not restart the review queue.' }, { status: 500 });
  }
}