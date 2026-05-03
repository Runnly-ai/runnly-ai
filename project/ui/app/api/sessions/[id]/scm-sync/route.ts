import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/utils/auth';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = String(params.id || '').trim();
    if (!sessionId) {
      return NextResponse.json({ error: 'Session id is required.' }, { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_API_URL}/sessions/${encodeURIComponent(sessionId)}/scm-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.cookies.get(AUTH_COOKIE_NAME)?.value || ''}`,
      },
      cache: 'no-store',
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const errorPayload = payload as { error?: string } | null;
      return NextResponse.json(
        { error: errorPayload?.error || `SCM sync failed (${upstream.status})` },
        { status: upstream.status }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
