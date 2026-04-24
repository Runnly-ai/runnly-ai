import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/utils/auth';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

interface EventRecord {
  id: string;
  type: string;
  createdAt: number;
}

interface SessionView {
  id: string;
  goal: string;
  status: string;
  currentStep: string;
  progress: number;
}

interface IntakeResponse {
  kind: 'task';
  request: {
    action: string;
    confidence: number;
  };
  sessionId: string;
  status: string;
  currentStep: string;
  progress: number;
  summary: string;
  events: EventRecord[];
  view: SessionView;
}

interface IntakeNeedsInfoResponse {
  kind: 'task_needs_info';
  summary: string;
  questions: string[];
}

interface IntakeConversationResponse {
  kind: 'conversation';
  request: {
    action: 'CONVERSE';
    confidence: number;
  };
  summary: string;
  reply: string;
}

type IntakeBackendResponse = IntakeResponse | IntakeConversationResponse | IntakeNeedsInfoResponse;

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error || `Backend request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function buildSummary(payload: IntakeResponse): string {
  if (payload.events.length === 0) {
    return `${payload.summary} Intent: ${payload.request.action} (${Math.round(payload.request.confidence * 100)}%).`;
  }

  const lastEvent = payload.events[payload.events.length - 1];
  return `${payload.summary} Latest event: ${lastEvent.type}. Intent: ${payload.request.action}.`;
}

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { message?: unknown; threadId?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const threadId = typeof body?.threadId === 'string' ? body.threadId.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'Field `message` is required.' }, { status: 400 });
    }

    const intake = await backendFetch<IntakeBackendResponse>('/intake/requests', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.cookies.get(AUTH_COOKIE_NAME)?.value || ''}`,
      },
      body: JSON.stringify({ message, threadId: threadId || undefined }),
    });
    if (intake.kind === 'conversation') {
      return NextResponse.json({
        kind: 'conversation',
        summary: intake.reply || intake.summary,
        events: [],
      });
    }
    if (intake.kind === 'task_needs_info') {
      const ask = intake.questions.length ? intake.questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n') : '';
      return NextResponse.json({
        kind: 'task_needs_info',
        summary: [intake.summary, ask].filter(Boolean).join('\n\n'),
        events: [],
      });
    }

    return NextResponse.json({
      kind: 'task',
      sessionId: intake.sessionId,
      status: intake.status,
      currentStep: intake.currentStep,
      progress: intake.progress,
      summary: buildSummary(intake),
      events: intake.events.map((event) => ({ id: event.id, type: event.type, createdAt: event.createdAt })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
