import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { supportsLanguage } from '@/lib/languages';
import { SRS_LIMITS, isValidTimezone } from '@/lib/srs/config';

async function ensureProfile(userId: string) {
  const result = await pool.query(
    `INSERT INTO profiles (user_id, native_language_code, active_target_language_code, active_source_language_code)
     VALUES ($1, 'en', 'it', 'en')
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING active_source_language_code AS "activeSourceLanguage",
               active_target_language_code AS "activeTargetLanguage",
               timezone,
               srs_new_cards_per_day AS "maxNewCardsPerDay",
               srs_max_reviews_per_day AS "maxReviewsPerDay",
               srs_diacritics_sensitive AS "diacriticsSensitive",
               srs_typo_tolerance AS "typoTolerance",
               srs_require_article_gender AS "requireArticleGender"`,
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
      if (!isValidTimezone(timezone)) {
        return NextResponse.json({ error: 'Choose a valid time zone.' }, { status: 400 });
      }
    }
    const maxNewCardsPerDay = body.maxNewCardsPerDay === undefined ? undefined : Number(body.maxNewCardsPerDay);
    const maxReviewsPerDay = body.maxReviewsPerDay === undefined ? undefined : Number(body.maxReviewsPerDay);
    const diacriticsSensitive = body.diacriticsSensitive === undefined ? undefined : body.diacriticsSensitive;
    const typoTolerance = body.typoTolerance === undefined ? undefined : Number(body.typoTolerance);
    const requireArticleGender = body.requireArticleGender === undefined ? undefined : body.requireArticleGender;
    if (diacriticsSensitive !== undefined && typeof diacriticsSensitive !== 'boolean') {
      return NextResponse.json({ error: 'Invalid diacritics setting.' }, { status: 400 });
    }
    if (requireArticleGender !== undefined && typeof requireArticleGender !== 'boolean') {
      return NextResponse.json({ error: 'Invalid article/gender setting.' }, { status: 400 });
    }
    if (typoTolerance !== undefined && (!Number.isInteger(typoTolerance) || typoTolerance < 0 || typoTolerance > 2)) {
      return NextResponse.json({ error: 'Typo tolerance must be between 0 and 2.' }, { status: 400 });
    }
    if (maxNewCardsPerDay !== undefined && (!Number.isInteger(maxNewCardsPerDay) || maxNewCardsPerDay < SRS_LIMITS.minNewCardsPerDay || maxNewCardsPerDay > SRS_LIMITS.maxNewCardsPerDay)) {
      return NextResponse.json({ error: 'New cards per day must be between 5 and 30.' }, { status: 400 });
    }
    if (maxReviewsPerDay !== undefined && (!Number.isInteger(maxReviewsPerDay) || maxReviewsPerDay < SRS_LIMITS.minReviewsPerDay || maxReviewsPerDay > SRS_LIMITS.maxReviewsPerDay)) {
      return NextResponse.json({ error: 'Reviews per day must be between 1 and 1000.' }, { status: 400 });
    }
    await ensureProfile(user.id);
    const result = await pool.query(
      `UPDATE profiles
       SET active_source_language_code=$1,
           active_target_language_code=$2,
           timezone=COALESCE($3, timezone),
           srs_new_cards_per_day=COALESCE($4, srs_new_cards_per_day),
           srs_max_reviews_per_day=COALESCE($5, srs_max_reviews_per_day),
           srs_diacritics_sensitive=COALESCE($6, srs_diacritics_sensitive),
           srs_typo_tolerance=COALESCE($7, srs_typo_tolerance),
           srs_require_article_gender=COALESCE($8, srs_require_article_gender)
       WHERE user_id=$9
       RETURNING active_source_language_code AS "activeSourceLanguage",
                 active_target_language_code AS "activeTargetLanguage",
                 timezone,
                 srs_new_cards_per_day AS "maxNewCardsPerDay",
                 srs_max_reviews_per_day AS "maxReviewsPerDay",
                 srs_diacritics_sensitive AS "diacriticsSensitive",
                 srs_typo_tolerance AS "typoTolerance",
                 srs_require_article_gender AS "requireArticleGender"`,
      [sourceLanguage, targetLanguage, timezone ?? null, maxNewCardsPerDay ?? null, maxReviewsPerDay ?? null, diacriticsSensitive ?? null, typoTolerance ?? null, requireArticleGender ?? null, user.id],
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
  }
}
