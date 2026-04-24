import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/utils/auth';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = String(params.id || '').trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'Session id is required.' }, { status: 400 });
  }

  const backendUrl = `${BACKEND_API_URL}/sessions/${encodeURIComponent(sessionId)}/stream`;
  const upstream = await fetch(backendUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${request.cookies.get(AUTH_COOKIE_NAME)?.value || ''}`,
      ...(request.headers.get('last-event-id')
        ? { 'Last-Event-ID': String(request.headers.get('last-event-id')) }
        : {}),
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: text || `Stream request failed with status ${upstream.status}` },
      { status: upstream.status }
    );
  }

  if (!upstream.body) {
    return NextResponse.json({ error: 'Upstream stream body is unavailable.' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
