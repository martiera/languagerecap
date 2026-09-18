#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { randomBytes, scryptSync } = require('crypto');
const { Client } = require('pg');

function readEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function getConnectionString() {
  return process.env.DATABASE_URL || readEnvFile().DATABASE_URL;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

function parseArgs(argv) {
  const args = { email: null, password: null, language: null, create: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--email' || item === '-e') args.email = argv[++i];
    else if (item === '--password' || item === '-p') args.password = argv[++i];
    else if (item === '--language' || item === '-l') args.language = argv[++i];
    else if (item === '--create') args.create = true;
    else if (!args.email) args.email = item;
  }
  return args;
}

async function ensureUser(client, email, password, create) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await client.query('SELECT id FROM app_users WHERE email = $1', [normalizedEmail]);
  if (existing.rows[0]) return existing.rows[0].id;
  if (!create) {
    throw new Error(`User ${normalizedEmail} does not exist. Create it first, or rerun with --create --password <password>.`);
  }
  if (!password) {
    throw new Error('Password is required when creating a new user with --create.');
  }
  const result = await client.query(
    'INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [normalizedEmail, hashPassword(password)],
  );
  return result.rows[0].id;
}

async function assignVocabulary(client, userId, languageCode) {
  const query = `
    SELECT l.id AS lexeme_id, s.id AS sense_id
    FROM language_lexemes l
    LEFT JOIN LATERAL (
      SELECT id
      FROM language_lexeme_senses s
      WHERE s.lexeme_id = l.id
      ORDER BY created_at
      LIMIT 1
    ) s ON true
    WHERE ($1::text IS NULL OR l.language_code = $1)
  `;
  const rows = await client.query(query, [languageCode]);

  let assigned = 0;
  let skipped = 0;
  let conjugationsAssigned = 0;

  for (const row of rows.rows) {
    const insertResult = await client.query(
      `INSERT INTO user_lexemes (user_id, lexeme_id, selected_sense_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, lexeme_id) DO UPDATE
       SET selected_sense_id = COALESCE(user_lexemes.selected_sense_id, EXCLUDED.selected_sense_id)
       RETURNING (xmax = 0) AS inserted`,
      [userId, row.lexeme_id, row.sense_id],
    );

    if (insertResult.rows[0]?.inserted) assigned += 1;
    else skipped += 1;

    const conjugationResult = await client.query(
      `INSERT INTO user_lexeme_conjugations (user_id, conjugation_id)
       SELECT $1, lc.id
       FROM language_lexeme_conjugations lc
       WHERE lc.lexeme_id = $2
       ON CONFLICT (user_id, conjugation_id) DO NOTHING
       RETURNING 1`,
      [userId, row.lexeme_id],
    );
    conjugationsAssigned += conjugationResult.rowCount || 0;
  }

  return { assigned, skipped, conjugationsAssigned };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  if (!email || email.startsWith('-')) {
    console.error('Usage: add-vocabulary-to-user <email> [--language <code>] [--create --password <password>]');
    process.exit(1);
  }
  const connectionString = getConnectionString();

  if (!connectionString) {
    console.error('DATABASE_URL is not set. Export it or add it to .env before running this script.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const userId = await ensureUser(client, email, args.password, args.create);
    const result = await assignVocabulary(client, userId, args.language);
    console.log(`Assigned ${result.assigned} lexemes to ${email}.`);
    if (result.skipped) console.log(`Skipped ${result.skipped} already-linked lexemes.`);
    console.log(`Assigned ${result.conjugationsAssigned} conjugation mappings.`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
