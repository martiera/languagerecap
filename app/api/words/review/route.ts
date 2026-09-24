import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isRegularItalianVerb } from '@/lib/italian-conjugation';
import { supportsLanguage } from '@/lib/languages';
import { SRS_LIMITS, isValidTimezone } from '@/lib/srs/config';
import { checkAnswer } from '@/lib/srs/answer';
import { defaultSrsConfig, inferGrade, type SrsGrade, type SrsState, type VocabularyCardState } from '@/lib/srs/scheduler';
import { isDailySessionComplete, isLessonRecapComplete, selectStudyQueue } from '@/lib/srs/queue';
import { scheduleVocabularyCard } from '@/lib/srs/schedule';

export const dynamic = 'force-dynamic';

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function positions(length: number) {
  if (length === 1) return [randomInt(3)];
  const base = Array.from({ length }, (_, index) => index % 3);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = shuffle(base);
    if (result.every((value, index) => index === 0 || value !== result[index - 1])) return result;
  }
  return shuffle(base);
}

function options(correct: string, distractors: string[], position: number) {
  const values = [correct, ...shuffle(distractors.filter(value => value !== correct)).slice(0, 2)];
  const current = values.indexOf(correct);
  if (position < values.length && current !== position) [values[current], values[position]] = [values[position], values[current]];
  return values;
}

function rowToCard(row: Record<string, unknown>): VocabularyCardState {
  return {
    cardType: row.cardType as VocabularyCardState['cardType'],
    difficulty: Number(row.srsDifficulty),
    stability: Number(row.srsStability),
    baseInterval: Number(row.srsBaseInterval),
    state: row.srsState as SrsState,
    due: new Date(row.srsDueAt as string | Date),
    lastReview: row.srsLastReviewAt ? new Date(row.srsLastReviewAt as string | Date) : null,
    reps: Number(row.srsReps),
    lapses: Number(row.srsLapses),
    leech: Boolean(row.srsLeech),
    learningStep: Number(row.learningStep),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const language = params.get('language') || 'it';
    const targetLanguage = params.get('targetLanguage') || language;
    const sourceLanguage = params.get('sourceLanguage') || 'en';
    const lessonId = params.get('lessonId');
    if (lessonId && !/^[0-9a-f-]{36}$/i.test(lessonId)) {
      return NextResponse.json({ error: 'Invalid lesson.' }, { status: 400 });
    }
    if (!supportsLanguage(targetLanguage) || !supportsLanguage(sourceLanguage) || targetLanguage === sourceLanguage) {
      return NextResponse.json({ error: 'Choose two different supported languages.' }, { status: 400 });
    }

    const profile = await pool.query(
      `SELECT COALESCE(timezone, 'UTC') AS timezone,
              COALESCE(srs_new_cards_per_day, $2) AS "maxNewCardsPerDay",
              COALESCE(srs_max_reviews_per_day, $3) AS "maxReviewsPerDay",
              COALESCE(srs_diacritics_sensitive, FALSE) AS "diacriticsSensitive",
              COALESCE(srs_typo_tolerance, 1) AS "typoTolerance",
              COALESCE(srs_require_article_gender, TRUE) AS "requireArticleGender"
       FROM profiles WHERE user_id=$1`,
      [user.id, SRS_LIMITS.defaultNewCardsPerDay, SRS_LIMITS.defaultReviewsPerDay],
    );
    const timezone = profile.rows[0]?.timezone || 'UTC';
    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: 'Your saved time zone is invalid.' }, { status: 500 });
    }
    const config = {
      ...defaultSrsConfig,
      maxNewCardsPerDay: Number(profile.rows[0]?.maxNewCardsPerDay || SRS_LIMITS.defaultNewCardsPerDay),
      maxReviewsPerDay: Number(profile.rows[0]?.maxReviewsPerDay || SRS_LIMITS.defaultReviewsPerDay),
    };
    const [daily, queue, allWords] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE reviewed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
           )::int AS "reviewsToday",
           COUNT(*) FILTER (
             WHERE reviewed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
               AND state_before='new'
               AND grade <> 'migration'
           )::int AS "newToday"
         FROM vocabulary_review_log
         WHERE user_id=$1
           AND grade <> 'migration'`,
        [user.id, timezone],
      ),
      pool.query(
        `SELECT
           ul.id,
           l.target_text AS "targetText",
           s.translation,
           l.grammatical_type AS type,
           ul.mastery_level AS "masteryLevel",
           ul.srs_card_type AS "cardType",
           ul.srs_difficulty AS "srsDifficulty",
           ul.srs_stability_days AS "srsStability",
           ul.srs_base_interval_days AS "srsBaseInterval",
           ul.srs_state AS "srsState",
           ul.srs_learning_step AS "learningStep",
           ul.srs_due_at AS "srsDueAt",
           ul.srs_last_review_at AS "srsLastReviewAt",
           ul.srs_reps AS "srsReps",
           ul.srs_lapses AS "srsLapses",
           ul.srs_leech AS "srsLeech",
           'word' AS "itemKind",
           l.is_irregular AS "isIrregular",
           COALESCE((
             SELECT lesson.short_story
             FROM lesson_lexemes lesson_word
             JOIN lessons lesson ON lesson.id=lesson_word.lesson_id
             WHERE lesson_word.lexeme_id=l.id AND lesson.user_id=$1
             ORDER BY lesson.created_at DESC
             LIMIT 1
           ), '') AS "contextSentence",
           COALESCE((
             SELECT json_agg(json_build_object(
               'tense', lc.tense,
               'person', lc.person,
               'form', lc.form,
               'translation', lc.translation
             ))
             FROM language_lexeme_conjugations lc
             WHERE lc.lexeme_id=l.id
           ), '[]'::json) AS "helperForms"
         FROM user_lexemes ul
         JOIN language_lexemes l ON l.id=ul.lexeme_id
         JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
         WHERE ul.user_id=$1
           AND l.language_code=$2
           AND s.source_language_code=$3
           AND ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM lesson_lexemes selected_lesson
             JOIN lessons selected_lesson_row ON selected_lesson_row.id=selected_lesson.lesson_id
             WHERE selected_lesson.lesson_id=$5::uuid
               AND selected_lesson.lexeme_id=l.id
               AND selected_lesson_row.user_id=$1
           ))
           AND (
             (ul.srs_state IN ('learning', 'relearning', 'review') AND ul.srs_due_at<=NOW())
             OR ul.srs_state='new'
           )
         ORDER BY
           CASE WHEN ul.srs_state='new' THEN 1 ELSE 0 END,
           ul.srs_due_at ASC,
           ul.srs_difficulty DESC
         LIMIT $4`,
        [user.id, targetLanguage, sourceLanguage, config.maxReviewsPerDay + config.maxNewCardsPerDay, lessonId],
      ),
      pool.query(
        `SELECT s.translation, ul.srs_state AS "srsState"
         FROM user_lexemes ul
         JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
         JOIN language_lexemes l ON l.id=ul.lexeme_id
         WHERE ul.user_id=$1 AND l.language_code=$2 AND s.source_language_code=$3
           AND ($4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM lesson_lexemes selected_lesson
             JOIN lessons selected_lesson_row ON selected_lesson_row.id=selected_lesson.lesson_id
             WHERE selected_lesson.lesson_id=$4::uuid
               AND selected_lesson.lexeme_id=l.id
               AND selected_lesson_row.user_id=$1
           ))`,
        [user.id, targetLanguage, sourceLanguage, lessonId],
      ),
    ]);

    const reviewsToday = Number(daily.rows[0]?.reviewsToday || 0);
    const newToday = Number(daily.rows[0]?.newToday || 0);
    const bounded = selectStudyQueue(queue.rows, { reviewsToday, newToday }, config);
    const newCount = bounded.filter(row => row.srsState === 'new').length;

    const distractors = allWords.rows.map(row => row.translation);
    const shuffledWords = shuffle(bounded);
    const answerPositions = positions(shuffledWords.length);
    const words = shuffledWords.map((word, index) => ({
      ...word,
      masteryLevel: user.isDemo ? 0 : word.masteryLevel,
      helperForms: targetLanguage === 'it' && !word.isIrregular && isRegularItalianVerb(word.targetText) ? [] : word.helperForms,
      options: options(word.translation, distractors, answerPositions[index]),
    }));
    return NextResponse.json({
      words,
      sourceLanguage,
      targetLanguage,
      dueToday: bounded.filter(word => word.srsState !== 'new').length,
      newAvailable: Math.max(0, Math.min(
        Number(queue.rows.filter(row => row.srsState === 'new').length) - newCount,
        Math.max(0, config.maxNewCardsPerDay - newToday),
      )),
      recapComplete: isLessonRecapComplete(
        allWords.rows.map(row => ({ srsState: row.srsState as SrsState })),
      ),
      reviewsToday,
      newToday,
      limits: {
        maxNewCardsPerDay: config.maxNewCardsPerDay,
        maxReviewsPerDay: config.maxReviewsPerDay,
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not load reviews.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const {
      wordId,
      itemKind,
      sourceLanguage,
      targetLanguage,
      userAnswer,
      isCorrect: legacyCorrect,
      responseTimeMs,
      grade: requestedGrade,
      override,
      sessionDueIds,
      sessionFailedIds,
      sessionCorrectIds,
    } = body;
    if (typeof wordId !== 'string' || itemKind !== 'word') {
      return NextResponse.json({ error: 'Invalid vocabulary review response.' }, { status: 400 });
    }
    if (sourceLanguage !== undefined && (typeof sourceLanguage !== 'string' || !supportsLanguage(sourceLanguage))) {
      return NextResponse.json({ error: 'Invalid source language.' }, { status: 400 });
    }
    if (targetLanguage !== undefined && (typeof targetLanguage !== 'string' || !supportsLanguage(targetLanguage))) {
      return NextResponse.json({ error: 'Invalid target language.' }, { status: 400 });
    }
    if (responseTimeMs !== undefined && (!Number.isInteger(responseTimeMs) || responseTimeMs < 0)) {
      return NextResponse.json({ error: 'Invalid response time.' }, { status: 400 });
    }
    const explicitGrade = requestedGrade === undefined ? undefined : requestedGrade as SrsGrade;
    if (explicitGrade !== undefined && !['again', 'hard', 'good', 'easy'].includes(explicitGrade)) {
      return NextResponse.json({ error: 'Invalid review grade.' }, { status: 400 });
    }
    if (override !== undefined && override !== true) {
      return NextResponse.json({ error: 'Invalid override.' }, { status: 400 });
    }
    if (explicitGrade !== undefined && override !== true) {
      return NextResponse.json({ error: 'A manual grade requires an explicit override.' }, { status: 400 });
    }

    await client.query('BEGIN');
    const current = await client.query(
      `SELECT
         ul.id,
         ul.lexeme_id AS "wordId",
         ul.selected_sense_id AS "senseId",
         ul.mastery_level AS "masteryLevel",
         ul.srs_card_type AS "cardType",
         ul.srs_difficulty AS "srsDifficulty",
         ul.srs_stability_days AS "srsStability",
         ul.srs_base_interval_days AS "srsBaseInterval",
         ul.srs_state AS "srsState",
         ul.srs_learning_step AS "learningStep",
         ul.srs_due_at AS "srsDueAt",
         ul.srs_last_review_at AS "srsLastReviewAt",
         ul.srs_reps AS "srsReps",
         ul.srs_lapses AS "srsLapses",
         ul.srs_leech AS "srsLeech",
         ul.srs_recognition_successes AS "recognitionSuccesses",
         ul.srs_production_unlocked AS "productionUnlocked",
         ul.srs_cloze_unlocked AS "clozeUnlocked",
         s.translation,
         l.language_code AS "targetLanguage",
         s.source_language_code AS "sourceLanguage"
       FROM user_lexemes ul
       JOIN language_lexemes l ON l.id=ul.lexeme_id
       JOIN language_lexeme_senses s ON s.id=ul.selected_sense_id
       WHERE ul.id=$1 AND ul.user_id=$2
       FOR UPDATE`,
      [wordId, user.id],
    );
    const row = current.rows[0];
    if (!row || !['recognition', 'production', 'cloze'].includes(row.cardType)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Review item not found.' }, { status: 404 });
    }
    if ((targetLanguage && row.targetLanguage !== targetLanguage) || (sourceLanguage && row.sourceLanguage !== sourceLanguage)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Review item does not belong to the selected language pair.' }, { status: 409 });
    }

    const profile = await client.query(
      `SELECT COALESCE(timezone, 'UTC') AS timezone,
              COALESCE(srs_new_cards_per_day, $2) AS "maxNewCardsPerDay",
              COALESCE(srs_max_reviews_per_day, $3) AS "maxReviewsPerDay",
              COALESCE(srs_diacritics_sensitive, FALSE) AS "diacriticsSensitive",
              COALESCE(srs_typo_tolerance, 1) AS "typoTolerance",
              COALESCE(srs_require_article_gender, TRUE) AS "requireArticleGender"
       FROM profiles WHERE user_id=$1
       FOR UPDATE`,
      [user.id, SRS_LIMITS.defaultNewCardsPerDay, SRS_LIMITS.defaultReviewsPerDay],
    );
    const timezone = profile.rows[0]?.timezone || 'UTC';
    if (!isValidTimezone(timezone)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Your saved time zone is invalid.' }, { status: 500 });
    }
    const config = {
      ...defaultSrsConfig,
      maxNewCardsPerDay: Number(profile.rows[0]?.maxNewCardsPerDay || SRS_LIMITS.defaultNewCardsPerDay),
      maxReviewsPerDay: Number(profile.rows[0]?.maxReviewsPerDay || SRS_LIMITS.defaultReviewsPerDay),
    };
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${user.id}:${new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())}`]);
    const daily = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE reviewed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
             AND grade <> 'migration'
         )::int AS reviews_today,
         COUNT(*) FILTER (
           WHERE reviewed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
             AND state_before='new'
             AND grade <> 'migration'
         )::int AS new_today
       FROM vocabulary_review_log
       WHERE user_id=$1`,
      [user.id, timezone],
    );
    const reviewsToday = Number(daily.rows[0]?.reviews_today || 0);
    const newToday = Number(daily.rows[0]?.new_today || 0);
    const cardIsNew = row.srsState === 'new';
    const now = new Date();
    if (!cardIsNew && new Date(row.srsDueAt).getTime() > now.getTime()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'This card is not due yet.' }, { status: 409 });
    }
    if ((cardIsNew && newToday >= config.maxNewCardsPerDay) || (!cardIsNew && reviewsToday >= config.maxReviewsPerDay)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Today’s review limit has been reached.' }, { status: 429 });
    }
    const actualCorrect = typeof userAnswer === 'string'
      ? checkAnswer(userAnswer, row.translation, {
          diacriticsSensitive: Boolean(profile.rows[0]?.diacriticsSensitive),
          typoTolerance: Number(profile.rows[0]?.typoTolerance || 0),
          requireArticleGender: Boolean(profile.rows[0]?.requireArticleGender),
        })
      : typeof legacyCorrect === 'boolean' && override === true
        ? legacyCorrect
        : undefined;
    if (actualCorrect === undefined && explicitGrade === undefined) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Answer or grade is required.' }, { status: 400 });
    }
    const grade: SrsGrade = explicitGrade || inferGrade(Boolean(actualCorrect), responseTimeMs ?? null, config);
    const correct = explicitGrade ? explicitGrade !== 'again' : Boolean(actualCorrect);
    const card = rowToCard(row);
    const scheduled = scheduleVocabularyCard(card, grade, now, config);
    const next = scheduled.card;
    if (user.isDemo) {
      await client.query('ROLLBACK');
      return NextResponse.json({ isCorrect: correct, grade });
    }

    await client.query(
      `INSERT INTO vocabulary_review_log (
         user_id, card_id, word_id, reviewed_at, card_type, user_answer, correct,
         response_time_ms, grade, state_before, state_after,
         interval_before_days, interval_after_days, algorithm_version,
         base_interval_before_days, base_interval_after_days,
         due_before, due_after, difficulty_before, difficulty_after,
         learning_step_before, learning_step_after, reps_before, reps_after,
         lapses_before, lapses_after, leech_before, leech_after,
         algorithm, applied_fuzz_ratio, answer_source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        user.id,
        row.id,
        row.wordId,
        now,
        card.cardType,
        typeof userAnswer === 'string' ? userAnswer : null,
        correct,
        responseTimeMs ?? null,
        grade,
        card.state,
        next.state,
        card.stability,
        next.stability,
        `${config.algorithm}-v1`,
        card.baseInterval,
        next.baseInterval,
        card.due,
        next.due,
        card.difficulty,
        next.difficulty,
        card.learningStep,
        next.learningStep,
        card.reps,
        next.reps,
        card.lapses,
        next.lapses,
        card.leech,
        next.leech,
        config.algorithm,
        scheduled.appliedFuzzRatio,
        typeof userAnswer === 'string' ? 'typed' : 'override',
      ],
    );
    const recognitionSuccesses = Number(row.recognitionSuccesses || 0) + (card.cardType === 'recognition' && correct ? 1 : 0);
    const productionUnlocked = Boolean(row.productionUnlocked) || recognitionSuccesses > 0;
    const clozeUnlocked = Boolean(row.clozeUnlocked) || recognitionSuccesses > 0;
    const nextCardType = card.cardType === 'recognition' && correct
      ? 'production'
      : card.cardType === 'production' && correct && clozeUnlocked
        ? 'cloze'
        : card.cardType;
    const masteryLevel = next.state === 'review' ? Math.min(5, Math.max(1, next.reps)) : 0;
    await client.query(
      `UPDATE user_lexemes
       SET mastery_level=$1,
           next_review_at=$2,
           last_reviewed_at=$3,
           srs_difficulty=$4,
           srs_stability_days=$5,
           srs_base_interval_days=$6,
           srs_state=$7,
           srs_due_at=$19::timestamptz,
           srs_last_review_at=$20::timestamptz,
           srs_learning_step=$8,
           srs_reps=$9,
           srs_lapses=$10,
           srs_leech=$11,
           srs_algorithm_version=$12,
           srs_card_type=$13,
           srs_recognition_successes=$14,
           srs_production_unlocked=$15,
           srs_cloze_unlocked=$16
       WHERE id=$17 AND user_id=$18`,
      [
        masteryLevel,
        next.due,
        next.lastReview,
        next.difficulty,
        next.stability,
        next.baseInterval,
        next.state,
        next.learningStep,
        next.reps,
        next.lapses,
        next.leech,
        `${config.algorithm}-v1`,
        nextCardType,
        recognitionSuccesses,
        productionUnlocked,
        clozeUnlocked,
        row.id,
        user.id,
        next.due,
        next.lastReview,
      ],
    );
    await client.query('COMMIT');
    const dueIds = Array.isArray(sessionDueIds) ? sessionDueIds.filter((value): value is string => typeof value === 'string') : [];
    const failedIds = Array.isArray(sessionFailedIds) ? sessionFailedIds.filter((value): value is string => typeof value === 'string') : [];
    const correctIds = new Set(Array.isArray(sessionCorrectIds) ? sessionCorrectIds.filter((value): value is string => typeof value === 'string') : []);
    if (!correct && !failedIds.includes(row.id)) failedIds.push(row.id);
    if (correct && failedIds.includes(row.id)) correctIds.add(row.id);
    return NextResponse.json({
      isCorrect: correct,
      grade,
      state: next.state,
      due: next.due,
      stability: next.stability,
      leech: next.leech,
      cardType: nextCardType,
      sessionComplete: isDailySessionComplete(dueIds.filter(id => id !== row.id), failedIds, correctIds),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: 'Could not update review.' }, { status: 500 });
  } finally {
    client.release();
  }
}
