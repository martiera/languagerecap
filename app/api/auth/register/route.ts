import { NextResponse } from 'next/server';
import { createSession, createUser, setSessionCookie } from '@/lib/auth';
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || typeof password !== 'string' || password.length < 10) return NextResponse.json({ error: 'Use a valid email and a password of at least 10 characters.' }, { status: 400 });
    const user = await createUser(email.trim(), password);
    const response = NextResponse.json({ user: { email: user.email } }, { status: 201 });
    setSessionCookie(response, await createSession(user.id), request);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate key')) return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    console.error(error); return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
