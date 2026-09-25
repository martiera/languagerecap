import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { GET, POST } from '@/app/api/words/review/route';
import { POST as RESET } from '@/app/api/words/review/reset/route';
import { defaultSrsConfig, type VocabularyCardState } from './scheduler';
import { scheduleVocabularyCard } from './schedule';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('SRS integration tests require TEST_DATABASE_URL; refusing to run without an explicit test database.');
}

let databaseName: string;
try {
  databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\/+/, ''));
} catch {
  throw new Error('SRS integration tests require TEST_DATABASE_URL to be a valid PostgreSQL connection URL.');
}
if (!/(test|verify|scratch)/i.test(databaseName)) {
  throw new Error(`SRS integration tests refuse database "${databaseName}". Use a database name containing test, verify, or scratch.`);
}
const enabled = true;

const requiredTables = [
  'app_users',
  'app_sessions',
  'profiles',
  'language_lexemes',
  'language_lexeme_senses',
  'user_lexemes',
  'vocabulary_review_log',
];

test.before(async () => {
  const missing = [];
  for (const table of requiredTables) {
    const result = await pool.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
    if (!result.rows[0]?.table_name) missing.push(table);
  }
  if (missing.length) {
    throw new Error(`SRS integration test schema is missing: ${missing.join(', ')}. Apply lib/schema.sql to the test database first.`);
  }
});

/*
 * These tests insert into app_users, profiles, language_lexemes,
 * language_lexeme_senses, user_lexemes, and app_sessions through createSession.
 * The review route inserts into and updates vocabulary_review_log and
 * user_lexemes. Cleanup deletes app_users, cascading to dependent rows.
 */

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
  const expectedReps = body.expectedReps ?? Number((await pool.query(
    'SELECT srs_reps FROM user_lexemes WHERE id=$1',
    [seed.cardId],
  )).rows[0]?.srs_reps);
  return POST(new Request('http://localhost/api/words/review', {
    method: 'POST',
    headers: { cookie: seed.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      wordId: seed.cardId,
      itemKind: 'word',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      userAnswer: seed.target,
      expectedReps,
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

test('a genuine duplicate submission is rejected with 409 and only one review is logged', { skip: !enabled }, async () => {
  const concurrent = await seedCard();
  try {
    await pool.query(
      `UPDATE user_lexemes
       SET srs_state='learning', srs_learning_step=1,
           srs_due_at=NOW() + INTERVAL '10 minutes',
           next_review_at=NOW() + INTERVAL '10 minutes'
       WHERE id=$1`,
      [concurrent.cardId],
    );
    const queued = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: concurrent.cookie },
    }));
    const queuedCard = (await queued.json()).words.find((word: { id: string }) => word.id === concurrent.cardId);
    const [one, two] = await Promise.all([
      review(concurrent, { expectedReps: queuedCard.reps }),
      review(concurrent, { expectedReps: queuedCard.reps }),
    ]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    const logs = await pool.query('SELECT COUNT(*)::int AS count FROM vocabulary_review_log WHERE card_id=$1', [concurrent.cardId]);
    assert.equal(logs.rows[0].count, 1);
  } finally {
    await cleanup(concurrent.userId);
  }
});

test('two sequential legitimate learn-ahead reviews each succeed with fresh expectedReps', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    await pool.query(
      `UPDATE user_lexemes
       SET srs_state='learning', srs_learning_step=0,
           srs_due_at=NOW() + INTERVAL '10 minutes',
           next_review_at=NOW() + INTERVAL '10 minutes'
       WHERE id=$1`,
      [seed.cardId],
    );
    const firstQueue = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: seed.cookie },
    }));
    const firstBody = await firstQueue.json();
    const firstCard = firstBody.words.find((word: { id: string }) => word.id === seed.cardId);
    const firstGapMinutes = (new Date(firstCard?.srsDueAt).getTime() - Date.now()) / 60_000;
    assert.ok(firstCard && firstGapMinutes > 0 && firstGapMinutes <= 20,
      `first GET must return a learn-ahead card within 20 minutes; actual gap=${firstGapMinutes.toFixed(3)} minutes`);
    const first = await review(seed, { expectedReps: firstCard.reps });
    assert.equal(first.status, 200);

    const secondQueue = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: seed.cookie },
    }));
    const secondBody = await secondQueue.json();
    const secondCard = secondBody.words.find((word: { id: string }) => word.id === seed.cardId);
    const secondGapMinutes = (new Date(secondCard?.srsDueAt).getTime() - Date.now()) / 60_000;
    assert.ok(secondCard && secondGapMinutes > 0 && secondGapMinutes <= 20,
      `second GET must return a learn-ahead card within 20 minutes; actual gap=${secondGapMinutes.toFixed(3)} minutes`);
    const second = await review(seed, { expectedReps: secondCard.reps });
    assert.equal(second.status, 200);
    const logs = await pool.query('SELECT COUNT(*)::int AS count FROM vocabulary_review_log WHERE card_id=$1', [seed.cardId]);
    assert.equal(logs.rows[0].count, 2);
  } finally {
    await cleanup(seed.userId);
  }
});

test('ten parallel submissions allow one review for learning, review, and relearning cards', { skip: !enabled }, async () => {
  const cards = [await seedCard(), await seedCard(), await seedCard()];
  const states = [
    `srs_state='learning', srs_learning_step=1,
     srs_due_at=NOW() + INTERVAL '10 minutes',
     next_review_at=NOW() + INTERVAL '10 minutes'`,
    `srs_state='review', srs_reps=1, srs_stability_days=1,
     srs_due_at=NOW(), next_review_at=NOW()`,
    `srs_state='relearning', srs_learning_step=1, srs_reps=2,
     srs_due_at=NOW() + INTERVAL '10 minutes',
     next_review_at=NOW() + INTERVAL '10 minutes'`,
  ];
  try {
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      await pool.query(`UPDATE user_lexemes SET ${states[index]} WHERE id=$1`, [card.cardId]);
      const current = await pool.query('SELECT srs_reps FROM user_lexemes WHERE id=$1', [card.cardId]);
      const results = await Promise.all(Array.from({ length: 10 }, () => review(card, {
        expectedReps: Number(current.rows[0].srs_reps),
      })));
      assert.equal(results.filter(result => result.status === 200).length, 1);
      assert.equal(results.filter(result => result.status === 409).length, 9);
      const logs = await pool.query('SELECT COUNT(*)::int AS count FROM vocabulary_review_log WHERE card_id=$1', [card.cardId]);
      assert.equal(logs.rows[0].count, 1);
    }
  } finally {
    for (const card of cards) await cleanup(card.userId);
  }
});

test('retrying the exact successful request is rejected without changing review state', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    const before = await pool.query(
      'SELECT srs_reps, srs_lapses, mode_tier, introduced_at FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    const expectedReps = Number(before.rows[0].srs_reps);
    const first = await review(seed, { expectedReps });
    assert.equal(first.status, 200);
    const second = await review(seed, { expectedReps });
    assert.equal(second.status, 409);
    const after = await pool.query(
      'SELECT srs_reps, srs_lapses, mode_tier, introduced_at FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    assert.equal(Number(after.rows[0].srs_reps), Number(before.rows[0].srs_reps) + 1);
    assert.equal(Number(after.rows[0].srs_lapses), Number(before.rows[0].srs_lapses));
    assert.equal(after.rows[0].mode_tier, before.rows[0].mode_tier);
    assert.equal(after.rows[0].introduced_at, before.rows[0].introduced_at);
    const logs = await pool.query('SELECT COUNT(*)::int AS count FROM vocabulary_review_log WHERE card_id=$1', [seed.cardId]);
    assert.equal(logs.rows[0].count, 1);
  } finally {
    await cleanup(seed.userId);
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

test('mode tiers promote, day-gate, demote with lapses, and re-promote', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    let response = await review(seed, {});
    assert.equal(response.status, 200);
    let row = await pool.query(
      'SELECT mode_tier, introduced_at FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    assert.equal(row.rows[0].mode_tier, 1);
    assert.ok(row.rows[0].introduced_at);

    await pool.query('UPDATE user_lexemes SET srs_due_at=NOW(), next_review_at=NOW() WHERE id=$1', [seed.cardId]);
    response = await review(seed, {});
    assert.equal(response.status, 200);
    row = await pool.query('SELECT mode_tier FROM user_lexemes WHERE id=$1', [seed.cardId]);
    assert.equal(row.rows[0].mode_tier, 2);

    await pool.query('UPDATE user_lexemes SET srs_due_at=NOW(), next_review_at=NOW() WHERE id=$1', [seed.cardId]);
    response = await review(seed, {});
    assert.equal(response.status, 200);
    row = await pool.query('SELECT mode_tier FROM user_lexemes WHERE id=$1', [seed.cardId]);
    assert.equal(row.rows[0].mode_tier, 2);

    await pool.query(
      `UPDATE user_lexemes
       SET mode_tier=2, srs_card_type='recognition',
           introduced_at=NOW() - INTERVAL '2 days',
           srs_last_review_at=NOW() - INTERVAL '2 days',
           srs_due_at=NOW(), next_review_at=NOW()
       WHERE id=$1`,
      [seed.cardId],
    );
    response = await review(seed, {});
    assert.equal(response.status, 200);
    const promotedBody = await response.json();
    assert.deepEqual(
      { cardType: promotedBody.cardType, modeTier: promotedBody.modeTier },
      { cardType: 'production', modeTier: 3 },
    );
    row = await pool.query(
      'SELECT mode_tier, srs_card_type, srs_production_unlocked, srs_cloze_unlocked FROM user_lexemes WHERE id=$1',
      [seed.cardId],
    );
    assert.deepEqual(row.rows[0], {
      mode_tier: 3,
      srs_card_type: 'production',
      srs_production_unlocked: true,
      srs_cloze_unlocked: false,
    });

    await pool.query(
      `UPDATE user_lexemes
       SET srs_due_at=NOW(), next_review_at=NOW()
       WHERE id=$1`,
      [seed.cardId],
    );
    response = await review(seed, { userAnswer: 'wrong answer' });
    assert.equal(response.status, 200);
    row = await pool.query(
      `SELECT mode_tier, srs_lapses, srs_card_type,
              (SELECT mode_tier_before FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1) AS mode_tier_before,
              (SELECT mode_tier_after FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1) AS mode_tier_after
       FROM user_lexemes WHERE id=$1`,
      [seed.cardId],
    );
    assert.deepEqual(row.rows[0], {
      mode_tier: 2,
      srs_lapses: 1,
      srs_card_type: 'recognition',
      mode_tier_before: 3,
      mode_tier_after: 2,
    });

    await pool.query(
      `UPDATE user_lexemes
       SET srs_due_at=NOW(), next_review_at=NOW()
       WHERE id=$1`,
      [seed.cardId],
    );
    response = await review(seed, {});
    assert.equal(response.status, 200);
    row = await pool.query('SELECT mode_tier FROM user_lexemes WHERE id=$1', [seed.cardId]);
    assert.equal(row.rows[0].mode_tier, 2);

    await pool.query(
      `UPDATE user_lexemes
       SET introduced_at=NOW() - INTERVAL '4 days',
           srs_last_review_at=NOW() - INTERVAL '2 days',
           srs_due_at=NOW(), next_review_at=NOW()
       WHERE id=$1`,
      [seed.cardId],
    );
    response = await review(seed, {});
    assert.equal(response.status, 200);
    row = await pool.query('SELECT mode_tier FROM user_lexemes WHERE id=$1', [seed.cardId]);
    assert.equal(row.rows[0].mode_tier, 3);

    await pool.query('UPDATE user_lexemes SET srs_due_at=NOW(), next_review_at=NOW() WHERE id=$1', [seed.cardId]);
    response = await review(seed, {});
    assert.equal(response.status, 200);
    row = await pool.query(
      `SELECT mode_tier,
              (SELECT mode_tier_before FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1) AS mode_tier_before,
              (SELECT mode_tier_after FROM vocabulary_review_log WHERE card_id=$1 ORDER BY reviewed_at DESC LIMIT 1) AS mode_tier_after
       FROM user_lexemes WHERE id=$1`,
      [seed.cardId],
    );
    assert.deepEqual(row.rows[0], {
      mode_tier: 3,
      mode_tier_before: 3,
      mode_tier_after: 3,
    });
  } finally {
    await cleanup(seed.userId);
  }
});

test('NULL mode tier behaves identically to tier 0', { skip: !enabled }, async () => {
  const seed = await seedCard();
  const second = await addCardForUser(seed.userId, seed.cookie);
  try {
    const queue = await GET(new Request('http://localhost/api/words/review?sourceLanguage=en&targetLanguage=de', {
      headers: { cookie: seed.cookie },
    }));
    assert.equal(queue.status, 200);
    const queuedCard = (await queue.json()).words.find((word: { id: string }) => word.id === seed.cardId);
    assert.equal(queuedCard.modeTier, 0);
    await pool.query(
      `UPDATE user_lexemes
       SET mode_tier=$2, srs_due_at=NOW(), next_review_at=NOW()
       WHERE id=$1`,
      [second.cardId, 0],
    );
    const [nullTier, zeroTier] = await Promise.all([
      review(seed, {}),
      review(second, {}),
    ]);
    assert.equal(nullTier.status, 200);
    assert.equal(zeroTier.status, 200);
    const rows = await pool.query(
      'SELECT mode_tier FROM user_lexemes WHERE id IN ($1,$2) ORDER BY id',
      [seed.cardId, second.cardId],
    );
    assert.deepEqual(rows.rows.map(row => row.mode_tier), [1, 1]);
  } finally {
    await cleanup(seed.userId);
  }
});

test('reset clears mode tier and introduction state with the legacy fields', { skip: !enabled }, async () => {
  const seed = await seedCard();
  try {
    await pool.query(
      `UPDATE user_lexemes
       SET mode_tier=3,
           introduced_at=NOW() - INTERVAL '3 days',
           srs_card_type='production',
           srs_production_unlocked=TRUE,
           srs_cloze_unlocked=FALSE,
           srs_lapses=7,
           srs_leech=TRUE
       WHERE id=$1`,
      [seed.cardId],
    );
    const response = await RESET(new Request(
      'http://localhost/api/words/review/reset?sourceLanguage=en&targetLanguage=de',
      {
        method: 'POST',
        headers: { cookie: seed.cookie },
      },
    ));
    assert.equal(response.status, 200);
    const row = await pool.query(
      `SELECT mode_tier, introduced_at, srs_card_type,
              srs_lapses, srs_leech, srs_production_unlocked, srs_cloze_unlocked
       FROM user_lexemes WHERE id=$1`,
      [seed.cardId],
    );
    assert.deepEqual(row.rows[0], {
      mode_tier: 0,
      introduced_at: null,
      srs_card_type: 'recognition',
      srs_lapses: 0,
      srs_leech: false,
      srs_production_unlocked: false,
      srs_cloze_unlocked: false,
    });
  } finally {
    await cleanup(seed.userId);
  }
});
