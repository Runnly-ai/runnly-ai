import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/utils/auth';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = String(params.id || '').trim();
    if (!sessionId) {
      return NextResponse.json({ error: 'Session id is required.' }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'Field `title` is required.' }, { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_API_URL}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.cookies.get(AUTH_COOKIE_NAME)?.value || ''}`,
      },
      body: JSON.stringify({ title }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const errorPayload = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { error: errorPayload?.error || `Rename failed (${upstream.status})` },
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
