import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== process.env.CRM_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const sessionValue = createHash('sha256')
    .update(`${process.env.CRM_PASSWORD}:${process.env.CRM_SECRET}`)
    .digest('hex');

  const res = NextResponse.json({ ok: true });
  res.cookies.set('crm_session', sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return res;
}
