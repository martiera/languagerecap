import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { pool } from '@/lib/db';
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ user: null });
  const profile = await pool.query(
    'SELECT active_source_language_code AS "activeSourceLanguage", active_target_language_code AS "activeTargetLanguage", timezone FROM profiles WHERE user_id=$1',
    [user.id],
  );
  return NextResponse.json({ user: { email: user.email, demo: user.isDemo, ...(profile.rows[0] || { activeSourceLanguage: 'en', activeTargetLanguage: 'it', timezone: null }) } });
}
