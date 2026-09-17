import { NextResponse } from 'next/server';
import { authenticateUser, createSession, setSessionCookie } from '@/lib/auth';
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));
  if (typeof email !== 'string' || typeof password !== 'string') return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  const user = await authenticateUser(email.trim(), password);
  if (!user) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  const response = NextResponse.json({ user: { email: user.email } });
  setSessionCookie(response, await createSession(user.id));
  return response;
}
