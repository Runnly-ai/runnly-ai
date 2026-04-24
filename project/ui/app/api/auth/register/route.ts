import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME, AuthUser } from '@/utils/auth';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

interface RegisterResponse {
  user: AuthUser;
  sessionToken: string;
}

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
    } | null;
    if (typeof body?.name !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'Fields `name`, `email`, and `password` are required.' }, { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        password: body.password,
      }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const errorPayload = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { error: errorPayload?.error || `Register failed (${upstream.status})` },
        { status: upstream.status }
      );
    }

    const payload = (await upstream.json()) as RegisterResponse;
    cookies().set(AUTH_COOKIE_NAME, payload.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ user: payload.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
