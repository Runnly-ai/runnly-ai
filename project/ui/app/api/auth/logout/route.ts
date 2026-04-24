import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/utils/auth';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';
    if (token) {
      await fetch(`${BACKEND_API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      }).catch(() => undefined);
    }

    cookies().delete(AUTH_COOKIE_NAME);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
