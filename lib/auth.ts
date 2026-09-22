import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'languagerecap_session';
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createUser(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    'INSERT INTO app_users (email, password_hash) VALUES ($1,$2) RETURNING id, email',
    [email.toLowerCase(), passwordHash],
  );
  return result.rows[0] as { id: string; email: string };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL \'30 days\')',
    [userId, hashToken(token)],
  );
  return token;
}

export async function authenticateUser(email: string, password: string) {
  const result = await pool.query('SELECT id, email, password_hash, is_demo FROM app_users WHERE email=$1', [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;
  return { id: user.id as string, email: user.email as string, isDemo: Boolean(user.is_demo) };
}

export async function getCurrentUser(request?: Request) {
  const token = request?.headers.get('cookie')?.match(/(?:^|; )languagerecap_session=([^;]+)/)?.[1] ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await pool.query(
    'SELECT u.id, u.email, u.is_demo FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',
    [hashToken(token)],
  );
  return result.rows[0] ? { id: result.rows[0].id as string, email: result.rows[0].email as string, isDemo: Boolean(result.rows[0].is_demo) } : null;
}

export const DEMO_USER_EMAIL = 'demo@languagerecap.local';

export async function createDemoSession() {
  const result = await pool.query('SELECT id, email FROM app_users WHERE email=$1 AND is_demo=TRUE', [DEMO_USER_EMAIL]);
  if (!result.rows[0]) throw new Error('Demo account is not configured.');
  return { user: { id: result.rows[0].id as string, email: result.rows[0].email as string }, token: await createSession(result.rows[0].id as string) };
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return user;
}

function shouldUseSecureCookie(request: Request) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(':', '');
  return process.env.NODE_ENV === 'production' && protocol === 'https';
}

export function setSessionCookie(response: NextResponse, token: string, request: Request) {
  const secure = shouldUseSecureCookie(request);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_DAYS * 86400, path: '/' });
}

export async function clearSession(request: Request, response: NextResponse) {
  const token = request.headers.get('cookie')?.match(/(?:^|; )languagerecap_session=([^;]+)/)?.[1];
  if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [hashToken(token)]);
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: shouldUseSecureCookie(request), expires: new Date(0), path: '/' });
}
