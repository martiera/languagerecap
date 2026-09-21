import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return NextResponse.json({ user: user ? { email: user.email, demo: user.isDemo } : null });
}
