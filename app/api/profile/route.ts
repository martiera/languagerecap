import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { supportsLanguage } from '@/lib/languages';

async function ensureProfile(userId: string) {
  const result = await pool.query(
    `INSERT INTO profiles (user_id, native_language_code, active_target_language_code, active_source_language_code)
     VALUES ($1, 'en', 'it', 'en')
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING active_source_language_code AS "activeSourceLanguage",
               active_target_language_code AS "activeTargetLanguage",
               timezone,
               srs_new_cards_per_day AS "maxNewCardsPerDay",
               srs_max_reviews_per_day AS "maxReviewsPerDay"`,
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
    const timezone = body.timezone === undefined ? undefined : body.timezone;
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !timezone) return NextResponse.json({ error: 'Choose a valid time zone.' }, { status: 400 });
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      } catch {
        return NextResponse.json({ error: 'Choose a valid time zone.' }, { status: 400 });
      }
    }
    const maxNewCardsPerDay = body.maxNewCardsPerDay === undefined ? undefined : Number(body.maxNewCardsPerDay);
    const maxReviewsPerDay = body.maxReviewsPerDay === undefined ? undefined : Number(body.maxReviewsPerDay);
    if (maxNewCardsPerDay !== undefined && (!Number.isInteger(maxNewCardsPerDay) || maxNewCardsPerDay < 5 || maxNewCardsPerDay > 30)) {
      return NextResponse.json({ error: 'New cards per day must be between 5 and 30.' }, { status: 400 });
    }
    if (maxReviewsPerDay !== undefined && (!Number.isInteger(maxReviewsPerDay) || maxReviewsPerDay < 1 || maxReviewsPerDay > 1000)) {
      return NextResponse.json({ error: 'Reviews per day must be between 1 and 1000.' }, { status: 400 });
    }
    await ensureProfile(user.id);
    const result = await pool.query(
      `UPDATE profiles
       SET active_source_language_code=$1,
           active_target_language_code=$2,
           timezone=COALESCE($3, timezone),
           srs_new_cards_per_day=COALESCE($4, srs_new_cards_per_day),
           srs_max_reviews_per_day=COALESCE($5, srs_max_reviews_per_day)
       WHERE user_id=$6
       RETURNING active_source_language_code AS "activeSourceLanguage",
                 active_target_language_code AS "activeTargetLanguage",
                 timezone,
                 srs_new_cards_per_day AS "maxNewCardsPerDay",
                 srs_max_reviews_per_day AS "maxReviewsPerDay"`,
      [sourceLanguage, targetLanguage, timezone ?? null, maxNewCardsPerDay ?? null, maxReviewsPerDay ?? null, user.id],
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
  }
}
