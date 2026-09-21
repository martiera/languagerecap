import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const language = search.get('language');
    const sourceLanguage = search.get('sourceLanguage');
    const user = await requireUser(request);
    const filters = ['l.user_id=$1', "NULLIF(BTRIM(l.short_story), '') IS NOT NULL"];
    const params: string[] = [user.id];
    if (language) {
      params.push(language);
      filters.push(`l.language_code=$${params.length}`);
    }
    if (sourceLanguage) {
      params.push(sourceLanguage);
      filters.push(`EXISTS (
        SELECT 1
        FROM lesson_lexemes pair_ll
        JOIN language_lexeme_senses pair_s ON pair_s.id=COALESCE(
          pair_ll.sense_id,
          (SELECT ul_pair.selected_sense_id
           FROM user_lexemes ul_pair
           WHERE ul_pair.user_id=$1 AND ul_pair.lexeme_id=pair_ll.lexeme_id)
        )
        WHERE pair_ll.lesson_id=l.id AND pair_s.source_language_code=$${params.length}
      )`);
    }
    const result = await pool.query(`SELECT l.id, l.title, l.short_story AS "shortStory", l.language_code AS "languageCode", l.created_at AS "createdAt", COALESCE(json_agg(json_build_object('targetText', x.target_text, 'translation', s.translation, 'type', x.grammatical_type)) FILTER (WHERE x.id IS NOT NULL), '[]') AS words FROM lessons l LEFT JOIN lesson_lexemes ll ON ll.lesson_id=l.id LEFT JOIN language_lexemes x ON x.id=ll.lexeme_id LEFT JOIN language_lexeme_senses s ON s.id=COALESCE(ll.sense_id, (SELECT ul.selected_sense_id FROM user_lexemes ul WHERE ul.user_id=$1 AND ul.lexeme_id=x.id LIMIT 1)) WHERE ${filters.join(' AND ')} GROUP BY l.id ORDER BY l.created_at DESC`, params);
    return NextResponse.json({ lessons: result.rows });
  } catch (error) { if (error instanceof Response) return error; console.error(error); return NextResponse.json({ error: 'Could not load lesson stories.' }, { status: 500 }); }
}
