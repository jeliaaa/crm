import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

function expectedSession() {
  return createHash('sha256')
    .update(`${process.env.CRM_PASSWORD}:${process.env.CRM_SECRET}`)
    .digest('hex');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get('crm_session')?.value;
  if (session !== expectedSession()) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
