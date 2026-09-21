import { NextResponse } from 'next/server';
import { createDemoSession, setSessionCookie } from '@/lib/auth';

export async function POST() {
  try {
    const demo = await createDemoSession();
    const response = NextResponse.json({ user: { email: demo.user.email, demo: true } });
    setSessionCookie(response, demo.token);
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'The demo is temporarily unavailable.' }, { status: 503 });
  }
}
