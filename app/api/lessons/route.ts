import { NextResponse } from 'next/server';
import { DEMO_USER_ID, pool } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const language = new URL(request.url).searchParams.get('language');
    const result = await pool.query(`SELECT l.id, l.title, l.short_story AS "shortStory", l.language_code AS "languageCode", l.created_at AS "createdAt", COALESCE(json_agg(json_build_object('targetText', w.target_text, 'translation', w.translation, 'type', w.grammatical_type)) FILTER (WHERE w.id IS NOT NULL), '[]') AS words FROM lessons l LEFT JOIN words w ON w.lesson_id=l.id WHERE l.user_id=$1 AND NULLIF(BTRIM(l.short_story), '') IS NOT NULL ${language ? 'AND l.language_code=$2' : ''} GROUP BY l.id ORDER BY l.created_at DESC`, language ? [DEMO_USER_ID, language] : [DEMO_USER_ID]);
    return NextResponse.json({ lessons: result.rows });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Could not load lesson stories.' }, { status: 500 }); }
}
