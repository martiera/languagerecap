import { NextResponse } from 'next/server';
import { DEMO_USER_ID, pool } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const language = new URL(request.url).searchParams.get('language');
    const filter = language ? ' AND language_code=$2' : '';
    const params = language ? [DEMO_USER_ID, language] : [DEMO_USER_ID];
    const result = await pool.query(`WITH reset_words AS (UPDATE words SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL WHERE user_id=$1${filter} RETURNING id) UPDATE word_conjugations SET mastery_level=0, next_review_at=NOW(), last_reviewed_at=NULL WHERE user_id=$1${filter}`, params);
    return NextResponse.json({ reset: result.rowCount ?? 0 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not restart the review queue.' }, { status: 500 });
  }
}