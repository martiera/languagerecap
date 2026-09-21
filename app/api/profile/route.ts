import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { supportsLanguage } from '@/lib/languages';

async function ensureProfile(userId: string) {
  const result = await pool.query(
    `INSERT INTO profiles (user_id, native_language_code, active_target_language_code, active_source_language_code)
     VALUES ($1, 'en', 'it', 'en')
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING active_source_language_code AS "activeSourceLanguage", active_target_language_code AS "activeTargetLanguage"`,
    [userId],
  );
  return result.rows[0];
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(await ensureProfile(user.id));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not load your profile.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const sourceLanguage = body.sourceLanguage;
    const targetLanguage = body.targetLanguage;
    if (typeof sourceLanguage !== 'string' || !supportsLanguage(sourceLanguage) || typeof targetLanguage !== 'string' || !supportsLanguage(targetLanguage) || sourceLanguage === targetLanguage) {
      return NextResponse.json({ error: 'Choose two different supported languages.' }, { status: 400 });
    }
    await ensureProfile(user.id);
    const result = await pool.query(
      `UPDATE profiles
       SET active_source_language_code=$1,
           active_target_language_code=$2
       WHERE user_id=$3
       RETURNING active_source_language_code AS "activeSourceLanguage", active_target_language_code AS "activeTargetLanguage"`,
      [sourceLanguage, targetLanguage, user.id],
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
  }
}
