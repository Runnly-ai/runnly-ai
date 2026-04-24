import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/utils/auth';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const upstream = await fetch(`${BACKEND_API_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const errorPayload = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { error: errorPayload?.error || `Request failed (${upstream.status})` },
        { status: upstream.status }
      );
    }

    const payload = await upstream.json();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
