import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  await clearSession(request, response);
  return response;
}
