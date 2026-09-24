import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { GET, POST } from '@/app/api/words/review/route';
import { defaultSrsConfig, type VocabularyCardState } from './scheduler';
import { scheduleVocabularyCard } from './schedule';

const enabled = Boolean(process.env.DATABASE_URL);

async function seedCard(options: { newCardsPerDay?: number } = {}) {
  const suffix = randomUUID();
  const user = await pool.query(
    `INSERT INTO app_users (email, password_hash)
     VALUES ($1, 'integration-test')
     RETURNING id`,
    [`srs-${suffix}@example.test`],
  );
  const userId = user.rows[0].id as string;
  await pool.query(
    `INSERT INTO profiles (user_id, timezone, srs_new_cards_per_day, srs_max_reviews_per_day)
     VALUES ($1, 'UTC', $2, 150)`,
    [userId, options.newCardsPerDay ?? 15],
  );
  const lexeme = await pool.query(
    `INSERT INTO language_lexemes (language_code, target_text, grammatical_type)
     VALUES ('de', $1, 'word') RETURNING id`,
    [`Haus-${suffix}`],
  );
  const sense = await pool.query(
    `INSERT INTO language_lexeme_senses (lexeme_id, source_language_code, translation)
     VALUES ($1, 'en', $2) RETURNING id`,
    [lexeme.rows[0].id, `house-${suffix}`],
  );
  const card = await pool.query(
    `INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, lexeme.rows[0].id, sense.rows[0].id],
  );
  const token = await createSession(userId);
  return {
    userId,
    cardId: card.rows[0].id as string,
    target: `house-${suffix}`,
    cookie: `languagerecap_session=${token}`,
  };
}

async function review(seed: Awaited<ReturnType<typeof seedCard>>, body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/words/review', {
    method: 'POST',
    headers: { cookie: seed.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      wordId: seed.cardId,
      itemKind: 'word',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      userAnswer: seed.target,
      ...body,
    }),
  }));
}

async function cleanup(userId: string) {
  await pool.query('DELETE FROM app_users WHERE id=$1', [userId]);
}

async function addCardForUser(userId: string, cookie: string) {
  const suffix = randomUUID();
  const lexeme = await pool.query(
    `INSERT INTO language_lexemes (language_code, target_text, grammatical_type)
     VALUES ('de', $1, 'word') RETURNING id`,
    [`Haus-${suffix}`],
  );
  const sense = await pool.query(
    `INSERT INTO language_lexeme_senses (lexeme_id, source_language_code, translation)
     VALUES ($1, 'en', $2) RETURNING id`,
    [lexeme.rows[0].id, `house-${suffix}`],
  );
  const card = await pool.query(
    `INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, lexeme.rows[0].id, sense.rows[0].id],
  );
  return { userId, cardId: card.rows[0].id as string, target: `house-${suffix}`, cookie };
}

test('PostgreSQL review log replay reproduces the stored card state', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    const response = await review(seed, { responseTimeMs: 800 });
    assert.equal(response.status, 200);
    const stored = await pool.query(
      `SELECT ul.srs_difficulty AS difficulty, ul.srs_stability_days AS stability,
              ul.srs_base_interval_days AS base_interval, ul.srs_state AS state,
              ul.srs_due_at AS due, ul.srs_last_review_at AS last_review,
              ul.srs_reps AS reps, ul.srs_lapses AS lapses, ul.srs_leech AS leech,
              ul.srs_learning_step AS learning_step,
              log.grade, log.reviewed_at, log.applied_fuzz_ratio
       FROM user_lexemes ul
       JOIN vocabulary_review_log log ON log.card_id=ul.id
       WHERE ul.id=$1
       ORDER BY log.reviewed_at DESC LIMIT 1`,
      [seed.cardId],
    );
    const row = stored.rows[0];
    const initial: VocabularyCardState = {
      cardType: 'recognition',
      difficulty: 5,
      stability: 0,
      baseInterval: 0,
      state: 'new',
      due: new Date(row.reviewed_at),
      lastReview: null,
      reps: 0,
      lapses: 0,
      leech: false,
      learningStep: 0,
    };
    const replayed = scheduleVocabularyCard(
      initial,
      row.grade,
      new Date(row.reviewed_at),
      {
        ...defaultSrsConfig,
        algorithm: 'ladder',
        random: () => row.applied_fuzz_ratio === null
          ? 0.5
          : ((Number(row.applied_fuzz_ratio) / defaultSrsConfig.fuzzRatio) + 1) / 2,
      },
    ).card;
    assert.equal(Number(row.difficulty), replayed.difficulty);
    assert.equal(Number(row.stability), replayed.stability);
    assert.equal(Number(row.base_interval), replayed.baseInterval);
    assert.equal(row.state, replayed.state);
    assert.equal(new Date(row.due).toISOString(), replayed.due.toISOString());
    assert.equal(new Date(row.last_review).toISOString(), replayed.lastReview?.toISOString());
    assert.equal(Number(row.reps), replayed.reps);
    assert.equal(Number(row.lapses), replayed.lapses);
    assert.equal(row.leech, replayed.leech);
    assert.equal(Number(row.learning_step), replayed.learningStep);
  } finally {
    await cleanup(seed.userId);
  }
});

test('PostgreSQL daily-cap locking allows only one concurrent new-card review', { skip: !enabled }, async () => {
  const first = await seedCard({ newCardsPerDay: 5 });
  try {
    const cards = [first];
    for (let index = 0; index < 5; index += 1) cards.push(await addCardForUser(first.userId, first.cookie));
    const results = await Promise.all(cards.map(card => review(card, {})));
    assert.equal(results.filter(result => result.status === 200).length, 5);
    assert.equal(results.filter(result => result.status === 429).length, 1);
  } finally {
    await cleanup(first.userId);
  }
});

test('concurrent reviews of one card cannot bypass due scheduling', { skip: !enabled }, async () => {
  const concurrent = await seedCard();
  try {
    const [one, two] = await Promise.all([review(concurrent, {}), review(concurrent, {})]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
  } finally {
    await cleanup(concurrent.userId);
  }
});

test('failed cards can circulate until a correct session retry', { skip: !enabled }, async () => {
  const seed = await seedCard();
  const sessionStartedAt = new Date(Date.now() - 1_000).toISOString();
  try {
    const first = await review(seed, {
      userAnswer: 'wrong answer',
      sessionRetry: false,
      sessionStartedAt,
      sessionDueIds: [seed.cardId],
      sessionFailedIds: [],
      sessionCorrectIds: [],
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).sessionComplete, false);

    const repeatedFailure = await review(seed, {
      userAnswer: 'still wrong',
      sessionRetry: true,
      sessionStartedAt,
      sessionDueIds: [seed.cardId],
      sessionFailedIds: [seed.cardId],
      sessionCorrectIds: [],
    });
    assert.equal(repeatedFailure.status, 200);
    assert.equal((await repeatedFailure.json()).sessionComplete, false);

    const correctRetry = await review(seed, {
      sessionRetry: true,
      sessionStartedAt,
      sessionDueIds: [seed.cardId, seed.cardId],
      sessionFailedIds: [seed.cardId, seed.cardId],
      sessionCorrectIds: [],
    });
    assert.equal(correctRetry.status, 200);
    assert.equal((await correctRetry.json()).sessionComplete, true);
  } finally {
    await cleanup(seed.userId);
  }
});

test('learning card due in ten minutes is returned and accepted by learn-ahead', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    await pool.query(
      `UPDATE user_lexemes
       SET srs_state='learning', srs_learning_step=1,
           srs_due_at=NOW() + INTERVAL '10 minutes',
           next_review_at=NOW() + INTERVAL '10 minutes'
       WHERE id=$1`,
      [seed.cardId],
    );
    const queued = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: seed.cookie },
    }));
    assert.equal(queued.status, 200);
    const queuedBody = await queued.json();
    assert.equal(queuedBody.words.some((word: { id: string }) => word.id === seed.cardId), true);

    const response = await review(seed, {});
    assert.equal(response.status, 200);
    const log = await pool.query(
      'SELECT reviewed_at FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1',
      [seed.cardId],
    );
    assert.ok(new Date(log.rows[0].reviewed_at).getTime() >= Date.now() - 5_000);
  } finally {
    await cleanup(seed.userId);
  }
});

test('learning card due in three hours is excluded and rejected', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    await pool.query(
      `UPDATE user_lexemes
       SET srs_state='learning', srs_learning_step=1,
           srs_due_at=NOW() + INTERVAL '3 hours',
           next_review_at=NOW() + INTERVAL '3 hours'
       WHERE id=$1`,
      [seed.cardId],
    );
    const queued = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: seed.cookie },
    }));
    assert.equal(queued.status, 200);
    const queuedBody = await queued.json();
    assert.equal(queuedBody.words.some((word: { id: string }) => word.id === seed.cardId), false);
    const response = await review(seed, {});
    assert.equal(response.status, 409);
  } finally {
    await cleanup(seed.userId);
  }
});

test('manual override is rejected without the flag and logged as override with it', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    const rejected = await review(seed, { userAnswer: undefined, isCorrect: true });
    assert.equal(rejected.status, 400);
    const accepted = await review(seed, { userAnswer: undefined, isCorrect: true, override: true });
    assert.equal(accepted.status, 200);
    const log = await pool.query(
      'SELECT answer_source FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1',
      [seed.cardId],
    );
    assert.equal(log.rows[0].answer_source, 'override');
  } finally {
    await cleanup(seed.userId);
  }
});

test('recognition success unlocks production, then production unlocks cloze', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    const recognition = await review(seed, {});
    assert.equal(recognition.status, 200);
    let row = await pool.query(
      'SELECT srs_card_type, srs_production_unlocked, srs_cloze_unlocked FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    assert.deepEqual(row.rows[0], {
      srs_card_type: 'production',
      srs_production_unlocked: true,
      srs_cloze_unlocked: true,
    });
    await pool.query(
      'UPDATE user_lexemes SET srs_due_at=NOW(), next_review_at=NOW() WHERE id=$1',
      [seed.cardId],
    );
    const production = await review(seed, {});
    assert.equal(production.status, 200);
    row = await pool.query(
      'SELECT srs_card_type FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    assert.equal(row.rows[0].srs_card_type, 'cloze');
  } finally {
    await cleanup(seed.userId);
  }
});
