'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Bot, ChevronDown, ChevronLeft, ChevronUp, LoaderCircle, Mic, MicOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SessionSidebar, type SessionSidebarItem } from '@/components/session-sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AuthUser } from '@/utils/auth';
import type { ChatApiResponse, ChatMessage } from '@/utils/types';
import { cn } from '@/utils/utils';

interface SessionEventRecord {
  id: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

interface SessionTraceMeta {
  sessionId: string;
  title: string;
  status: string;
  currentStep: string;
  progress: number;
  streamState: 'idle' | 'connecting' | 'connected' | 'error';
  events: SessionEventRecord[];
  unreadCount: number;
  createdAt: number;
  lastEventAt: number | null;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

type VoiceInputStatus = 'idle' | 'starting' | 'listening' | 'error';

const STREAM_EVENT_TYPES = [
  'SESSION_STARTED',
  'PLAN_COMPLETED',
  'IMPLEMENT_COMPLETED',
  'TEST_FAILED',
  'TEST_PASSED',
  'REVIEW_COMPLETED',
  'REVIEW_FAILED',
  'COMMAND_FAILED',
  'SCM_WORKSPACE_PREPARED',
  'SCM_PR_CREATED',
  'SCM_NO_CHANGES',
  'SCM_FEEDBACK_SYNCED',
  'SCM_PIPELINE_FAILED',
  'SCM_REVIEW_COMMENT_ADDED',
  'SCM_PIPELINE_PASSED',
  'SESSION_COMPLETED',
  'LOG_EMITTED',
] as const;

function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(ts);
}

function formatClock(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

function normalizeTaskTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'New Task';
  }
  if (trimmed.length <= 34) {
    return trimmed;
  }
  return `${trimmed.slice(0, 34)}...`;
}

function toAssistantMessage(result: Extract<ChatApiResponse, { kind: 'task' }>): string {
  const eventTrail = result.events.length ? result.events.map((event) => event.type).join(' -> ') : 'No events captured yet.';
  const kickoff = result.status === 'running'
    ? 'Started work on your task. You can follow execution logs on the right panel.'
    : 'Task intake completed. You can follow execution logs on the right panel.';
  return [
    kickoff,
    '',
    result.summary,
    '',
    `Session: ${result.sessionId}`,
    `Status: ${result.status}`,
    `Current step: ${result.currentStep}`,
    `Progress: ${result.progress}%`,
    `Events: ${eventTrail}`,
  ].join('\n');
}

function toSessionStatusFromEvent(eventType: string, currentStatus: string): string {
  if (eventType === 'SESSION_COMPLETED') {
    return 'completed';
  }
  if (['TEST_FAILED', 'REVIEW_FAILED', 'COMMAND_FAILED', 'SCM_PIPELINE_FAILED'].includes(eventType)) {
    return 'failed';
  }
  if (currentStatus === 'completed' || currentStatus === 'failed') {
    return currentStatus;
  }
  return 'running';
}

function statusClassName(status: string): string {
  if (status === 'completed') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (status === 'failed') {
    return 'bg-red-100 text-red-700';
  }
  if (status === 'running') {
    return 'bg-blue-100 text-blue-700';
  }
  return 'bg-muted text-muted-foreground';
}

export default function ChatPage() {
  const router = useRouter();
  const [authBooting, setAuthBooting] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionOrder, setSessionOrder] = useState<string[]>([]);
  const [sessionTraces, setSessionTraces] = useState<Record<string, SessionTraceMeta>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [followLatest, setFollowLatest] = useState(true);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [desktopLogsCollapsed, setDesktopLogsCollapsed] = useState(false);
  const [chatPanePercent, setChatPanePercent] = useState(52);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktopSplit, setIsDesktopSplit] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceInputStatus>('idle');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<Record<string, EventSource>>({});
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseInputRef = useRef('');
  const submitAfterVoiceStopRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const followLatestRef = useRef(true);

  const isVoiceActive = voiceStatus === 'starting' || voiceStatus === 'listening';
  const canSend = useMemo(() => (input.trim().length > 0 || isVoiceActive) && !isLoading, [input, isLoading, isVoiceActive]);
  const toggleLogsPanel = () => {
    if (isDesktopSplit) {
      setDesktopLogsCollapsed((value) => !value);
      return;
    }
    setLogsCollapsed((value) => !value);
  };

  useEffect(() => {
    let cancelled = false;
    const loadAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          if (!cancelled) {
            router.push('/auth');
          }
          return;
        }
        const payload = (await response.json()) as { user?: AuthUser };
        if (!cancelled) {
          if (!payload.user) {
            router.push('/auth');
            return;
          }
          setAuthUser(payload.user);
        }
      } finally {
        if (!cancelled) {
          setAuthBooting(false);
        }
      }
    };
    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    followLatestRef.current = followLatest;
  }, [followLatest]);

  useEffect(() => {
    return () => {
      Object.values(sourcesRef.current).forEach((source) => source.close());
      sourcesRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const container = splitContainerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(30, Math.min(70, next));
      setChatPanePercent(clamped);
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const sync = () => setIsDesktopSplit(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructorLike;
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    setVoiceSupported(Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    return () => {
      submitAfterVoiceStopRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const buildTranscript = (results: ArrayLike<SpeechRecognitionResultLike>): string => {
    let transcript = '';
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const item = result?.[0];
      const piece = typeof item?.transcript === 'string' ? item.transcript : '';
      if (piece) {
        transcript += piece;
      }
    }
    return transcript.trim();
  };

  const getSpeechRecognition = (): SpeechRecognitionConstructorLike | null => {
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructorLike;
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
  };

  const getVoiceErrorMessage = (error: string, message?: string): string => {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      return 'Microphone access was denied.';
    }
    if (error === 'no-speech') {
      return 'No speech was detected.';
    }
    if (message && message.trim()) {
      return message.trim();
    }
    return 'Voice input failed. Please try again.';
  };

  const stopVoiceInput = (submitAfterStop = false) => {
    submitAfterVoiceStopRef.current = submitAfterStop;
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    try {
      recognition.stop();
    } catch {
      recognition.abort();
    }
  };

  const startVoiceInput = () => {
    if (isLoading) {
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setVoiceStatus('error');
      setVoiceError('Voice input is not supported in this browser.');
      return;
    }

    if (isVoiceActive) {
      stopVoiceInput(false);
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    voiceBaseInputRef.current = input;
    submitAfterVoiceStopRef.current = false;
    setVoiceError('');
    setVoiceStatus('starting');

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceStatus('listening');
    };

    recognition.onresult = (event) => {
      const transcript = buildTranscript(event.results);
      const base = voiceBaseInputRef.current;
      if (!transcript) {
        setInput(base);
        return;
      }
      if (!base) {
        setInput(transcript);
        return;
      }
      const separator = base.endsWith(' ') ? '' : ' ';
      setInput(`${base}${separator}${transcript}`);
    };

    recognition.onerror = (event) => {
      submitAfterVoiceStopRef.current = false;
      setVoiceStatus('error');
      setVoiceError(getVoiceErrorMessage(event.error, event.message));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceStatus('idle');
      if (submitAfterVoiceStopRef.current) {
        submitAfterVoiceStopRef.current = false;
        requestAnimationFrame(() => {
          composerFormRef.current?.requestSubmit();
        });
      }
    };

    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setVoiceStatus('error');
      setVoiceError(error instanceof Error ? error.message : 'Voice input failed to start.');
    }
  };

  const toggleVoiceInput = () => {
    if (isVoiceActive) {
      stopVoiceInput(false);
      return;
    }
    startVoiceInput();
  };

  const ensureSessionEntry = (sessionId: string, defaults?: Partial<SessionTraceMeta>) => {
    setSessionTraces((previous) => {
      if (previous[sessionId]) {
        return previous;
      }
      return {
        ...previous,
        [sessionId]: {
          sessionId,
          title: defaults?.title || 'New Task',
          status: defaults?.status || 'idle',
          currentStep: defaults?.currentStep || 'idle',
          progress: defaults?.progress ?? 0,
          streamState: defaults?.streamState || 'idle',
          events: defaults?.events || [],
          unreadCount: defaults?.unreadCount ?? 0,
          createdAt: defaults?.createdAt ?? Date.now(),
          lastEventAt: defaults?.lastEventAt ?? null,
        },
      };
    });
  };

  const upsertSessionMeta = (sessionId: string, patch: Partial<SessionTraceMeta>) => {
    setSessionTraces((previous) => {
      const existing = previous[sessionId];
      const base: SessionTraceMeta = existing || {
        sessionId,
        title: 'New Task',
        status: 'idle',
        currentStep: 'idle',
        progress: 0,
        streamState: 'idle',
        events: [],
        unreadCount: 0,
        createdAt: Date.now(),
        lastEventAt: null,
      };
      return {
        ...previous,
        [sessionId]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const markSessionAsActive = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessionTraces((previous) => {
      const entry = previous[sessionId];
      if (!entry || entry.unreadCount === 0) {
        return previous;
      }
      return {
        ...previous,
        [sessionId]: {
          ...entry,
          unreadCount: 0,
        },
      };
    });
  };

  const beginRenameSession = (sessionId: string) => {
    const currentTitle = sessionTraces[sessionId]?.title || 'New Task';
    setEditingSessionId(sessionId);
    setEditingSessionTitle(currentTitle);
  };

  const cancelRenameSession = () => {
    setEditingSessionId(null);
    setEditingSessionTitle('');
  };

  const commitRenameSession = async (sessionId: string) => {
    const normalized = normalizeTaskTitle(editingSessionTitle);
    if (!normalized.trim()) {
      cancelRenameSession();
      return;
    }

    const previousTitle = sessionTraces[sessionId]?.title || 'New Task';
    upsertSessionMeta(sessionId, { title: normalized });
    cancelRenameSession();

    if (!sessionId.startsWith('sess_')) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: normalized }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Rename failed (${response.status})`);
      }
    } catch {
      upsertSessionMeta(sessionId, { title: previousTitle });
    }
  };

  const deleteSession = (sessionId: string) => {
    const remainingSessions = sessionOrder.filter((id) => id !== sessionId);
    const nextActiveId = activeSessionId === sessionId ? (remainingSessions[0] || null) : activeSessionId;

    const source = sourcesRef.current[sessionId];
    if (source) {
      source.close();
      delete sourcesRef.current[sessionId];
    }

    setMessages((previous) => previous.filter((message) => message.sessionId !== sessionId));
    setSessionOrder(remainingSessions);
    setSessionTraces((previous) => {
      const next = { ...previous };
      delete next[sessionId];
      return next;
    });
    setOpenSessionMenuId((previous) => (previous === sessionId ? null : previous));
    if (editingSessionId === sessionId) {
      cancelRenameSession();
    }
    setActiveSessionId(nextActiveId);
    activeSessionIdRef.current = nextActiveId;
  };

  const createLocalSession = () => {
    const localSessionId = `local_${Date.now()}`;
    ensureSessionEntry(localSessionId, {
      title: 'New Task',
      status: 'idle',
      currentStep: 'idle',
      progress: 0,
      streamState: 'idle',
      createdAt: Date.now(),
    });
    setSessionOrder((previous) => [localSessionId, ...previous]);
    markSessionAsActive(localSessionId);
    setFollowLatest(false);
    return localSessionId;
  };

  const migrateSessionId = (fromSessionId: string, toSessionId: string, titleHint: string) => {
    if (fromSessionId === toSessionId) {
      return;
    }

    setSessionTraces((previous) => {
      const fromEntry = previous[fromSessionId];
      const toEntry = previous[toSessionId];
      const merged: SessionTraceMeta = {
        sessionId: toSessionId,
        title: toEntry?.title || fromEntry?.title || normalizeTaskTitle(titleHint),
        status: toEntry?.status || fromEntry?.status || 'running',
        currentStep: toEntry?.currentStep || fromEntry?.currentStep || 'idle',
        progress: toEntry?.progress ?? fromEntry?.progress ?? 0,
        streamState: toEntry?.streamState || fromEntry?.streamState || 'idle',
        events: toEntry?.events || fromEntry?.events || [],
        unreadCount: toEntry?.unreadCount ?? fromEntry?.unreadCount ?? 0,
        createdAt: toEntry?.createdAt ?? fromEntry?.createdAt ?? Date.now(),
        lastEventAt: toEntry?.lastEventAt ?? fromEntry?.lastEventAt ?? null,
      };
      const next = { ...previous, [toSessionId]: merged };
      delete next[fromSessionId];
      return next;
    });

    setSessionOrder((previous) => previous.map((id) => (id === fromSessionId ? toSessionId : id)));
    setMessages((previous) =>
      previous.map((message) => (message.sessionId === fromSessionId ? { ...message, sessionId: toSessionId } : message)),
    );
    setActiveSessionId((previous) => (previous === fromSessionId ? toSessionId : previous));
    activeSessionIdRef.current = activeSessionIdRef.current === fromSessionId ? toSessionId : activeSessionIdRef.current;

    const oldSource = sourcesRef.current[fromSessionId];
    if (oldSource) {
      oldSource.close();
      delete sourcesRef.current[fromSessionId];
    }
  };

  const ensureSessionStream = (sessionId: string) => {
    if (sourcesRef.current[sessionId]) {
      return;
    }

    ensureSessionEntry(sessionId);
    upsertSessionMeta(sessionId, { streamState: 'connecting' });
    const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/stream`);
    sourcesRef.current[sessionId] = source;

    const onEvent = (incoming: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(incoming.data) as SessionEventRecord;
        setSessionTraces((previous) => {
          const session = previous[sessionId];
          if (!session) {
            return previous;
          }
          if (session.events.some((event) => event.id === parsed.id)) {
            return previous;
          }
          const nextEvents = [...session.events, parsed].sort((a, b) => a.createdAt - b.createdAt);
          const cappedEvents = nextEvents.length > 400 ? nextEvents.slice(nextEvents.length - 400) : nextEvents;
          const isActiveSession = activeSessionIdRef.current === sessionId;
          return {
            ...previous,
            [sessionId]: {
              ...session,
              status: toSessionStatusFromEvent(parsed.type, session.status),
              events: cappedEvents,
              lastEventAt: parsed.createdAt,
              unreadCount: isActiveSession ? 0 : session.unreadCount + 1,
            },
          };
        });
      } catch {
        // Ignore malformed records.
      }
    };

    source.onopen = () => {
      upsertSessionMeta(sessionId, { streamState: 'connected' });
    };

    source.onerror = () => {
      upsertSessionMeta(sessionId, { streamState: 'error' });
    };

    for (const eventType of STREAM_EVENT_TYPES) {
      source.addEventListener(eventType, onEvent as EventListener);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    const targetSessionId = activeSessionIdRef.current;
    if (isVoiceActive) {
      stopVoiceInput(true);
      return;
    }
    if (!content || isLoading || !targetSessionId) {
      return;
    }

    const userMessageId = `user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content,
      createdAt: Date.now(),
      sessionId: targetSessionId,
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content, threadId: targetSessionId }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || `Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as ChatApiResponse;
      if (payload.kind === 'conversation' || payload.kind === 'task_needs_info') {
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: payload.summary,
          createdAt: Date.now(),
          sessionId: targetSessionId,
        };
        setMessages((previous) => [...previous, assistantMessage]);
        upsertSessionMeta(targetSessionId, {
          status: 'idle',
          currentStep: 'idle',
          progress: 0,
        });
      } else {
        migrateSessionId(targetSessionId, payload.sessionId, content);
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: toAssistantMessage(payload),
          createdAt: Date.now(),
          sessionId: payload.sessionId,
        };

        setMessages((previous) => {
          const withLinkedUser = previous.map((message) =>
            message.id === userMessageId ? { ...message, sessionId: payload.sessionId } : message,
          );
          return [...withLinkedUser, assistantMessage];
        });

        upsertSessionMeta(payload.sessionId, {
          title: normalizeTaskTitle(content),
          status: payload.status || 'running',
          currentStep: payload.currentStep,
          progress: payload.progress,
        });

        setSessionOrder((previous) => [payload.sessionId, ...previous.filter((id) => id !== payload.sessionId)]);
        if (followLatestRef.current || !activeSessionIdRef.current) {
          markSessionAsActive(payload.sessionId);
        } else {
          ensureSessionEntry(payload.sessionId, { title: normalizeTaskTitle(content) });
        }
        ensureSessionStream(payload.sessionId);
      }
    } catch (error) {
      const assistantError: ChatMessage = {
        id: `assistant_error_${Date.now()}`,
        role: 'assistant',
        content: error instanceof Error ? `Error: ${error.message}` : 'Error: failed to process request.',
        createdAt: Date.now(),
      };
      setMessages((previous) => [...previous, assistantError]);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  };

  const handleLogout = async () => {
    setAuthPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/auth');
    } finally {
      setAuthPending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    if (event.altKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart ?? input.length;
      const end = textarea.selectionEnd ?? input.length;
      const nextValue = `${input.slice(0, start)}\n${input.slice(end)}`;
      setInput(nextValue);
      requestAnimationFrame(() => {
        const cursor = start + 1;
        textarea.setSelectionRange(cursor, cursor);
      });
      return;
    }
    event.preventDefault();
    if (!canSend) {
      return;
    }
    composerFormRef.current?.requestSubmit();
  };

  const activeSession = activeSessionId ? sessionTraces[activeSessionId] : null;
  const visibleMessages = activeSessionId ? messages.filter((message) => message.sessionId === activeSessionId) : [];

  const activeWorkLogs = useMemo(() => {
    if (!activeSession) {
      return [] as Array<{ id: string; createdAt: number; module: string; activity: string }>;
    }
    const ignored = [
      /orchestrator received event/i,
      /orchestrator skipped event/i,
      /intake converted user message/i,
      /intake validation result/i,
      /intake applied user answer/i,
      /scm root ensured/i,
      /scm workspace paths resolved/i,
      /scm feedback collection started/i,
      /scm feedback collection completed/i,
    ];
    const allow = [
      /started workflow step/i,
      /retrying workflow step/i,
      /handling workflow step/i,
      /created session after successful validation/i,
      /handed off validated task to orchestration/i,
      /prepare completed/i,
      /clone completed/i,
      /worktree creation completed/i,
      /git commit completed/i,
      /git push completed/i,
      /pull request creation completed/i,
      /publish completed/i,
      /marked session completed/i,
      /marked session failed/i,
    ];
    return activeSession.events
      .filter((event) => event.type === 'LOG_EMITTED')
      .map((event) => {
        const source = typeof event.payload.source === 'string' ? event.payload.source : 'system';
        const rawMessage = typeof event.payload.message === 'string' ? event.payload.message.trim() : '';
        if (!rawMessage) {
          return null;
        }
        if (ignored.some((pattern) => pattern.test(rawMessage))) {
          return null;
        }
        if (!allow.some((pattern) => pattern.test(rawMessage))) {
          return null;
        }
        const activity = rawMessage.replace(new RegExp(`^${source}\\s+`, 'i'), '');
        return {
          id: event.id,
          createdAt: event.createdAt,
          module: source,
          activity: activity || rawMessage,
        };
      })
      .filter((entry): entry is { id: string; createdAt: number; module: string; activity: string } => Boolean(entry));
  }, [activeSession]);

  const sidebarSessions = sessionOrder
    .map((sessionId) => {
      const session = sessionTraces[sessionId];
      if (!session) {
        return null;
      }

      return {
        sessionId,
        title: session.title || 'New Task',
        timeLabel: formatClock(session.lastEventAt || session.createdAt),
        unreadCount: session.unreadCount,
        isActive: activeSessionId === sessionId,
        isEditing: editingSessionId === sessionId,
        editingTitle: editingSessionId === sessionId ? editingSessionTitle : session.title || 'New Task',
      };
    })
    .filter((item): item is SessionSidebarItem => Boolean(item));

  if (authBooting || !authUser) {
    return (
      <main className="flex h-screen w-full items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <SessionSidebar
        user={authUser}
        sessions={sidebarSessions}
        openSessionMenuId={openSessionMenuId}
        onCreateSession={createLocalSession}
        onSelectSession={markSessionAsActive}
        onBeginRenameSession={beginRenameSession}
        onCommitRenameSession={(sessionId) => {
          void commitRenameSession(sessionId);
        }}
        onCancelRenameSession={cancelRenameSession}
        onDeleteSession={deleteSession}
        onEditingTitleChange={setEditingSessionTitle}
        onOpenSessionMenuChange={setOpenSessionMenuId}
        onLogout={() => {
          void handleLogout();
        }}
        logoutPending={authPending}
      />
      <SidebarInset>
        <div className="flex min-h-svh flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Workspace</p>
              <p className="truncate text-xs text-muted-foreground">
                {activeSessionId ? `ID: ${activeSessionId}` : 'No active workspace'}
              </p>
            </div>
          </header>

          <div className={cn('flex flex-1 min-h-0 flex-col gap-4 p-4 md:p-6', isResizing ? 'select-none' : '')}>
            {activeSession ? (
              <div
                ref={splitContainerRef}
                className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-0"
              >
                <section
                  className="flex min-h-0 flex-1 flex-col bg-card"
                  style={isDesktopSplit && !desktopLogsCollapsed ? { width: `calc(${chatPanePercent}% - 4px)` } : undefined}
                >
                  <div className="mx-auto flex w-full max-w-3xl flex-none items-center justify-between px-6 py-4 md:px-10">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">{activeSession?.title || 'New Task'}</span>
                    </div>
                    <span className={cn('rounded px-2 py-0.5 text-xs capitalize', statusClassName(activeSession?.status || 'idle'))}>
                      {activeSession?.status || 'idle'}
                    </span>
                  </div>

                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-6 py-4 md:px-10">
                    <div className="mx-auto w-full max-w-3xl space-y-4">
                      {activeSessionId ? (
                        visibleMessages.length === 0 ? (
                          <div className="pt-16 text-center text-sm text-muted-foreground">
                            Send a message to start the conversation
                          </div>
                        ) : (
                          visibleMessages.map((message) => (
                            <article
                              key={message.id}
                              className={cn(
                                'max-w-[92%] text-base',
                                message.role === 'user'
                                  ? 'ml-auto w-fit rounded-2xl bg-muted px-4 py-2'
                                  : 'mr-auto bg-transparent px-0 py-0',
                              )}
                            >
                              <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{message.content}</pre>
                            </article>
                          ))
                        )
                      ) : (
                        <div className="pt-16 text-center text-sm text-muted-foreground">
                          Select a session or send a new message to create one
                        </div>
                      )}
                      {isLoading ? (
                        <div className="mr-auto inline-flex items-center gap-2 rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          Agent is thinking now
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <form ref={composerFormRef} onSubmit={handleSubmit} className="px-6 pb-4 pt-2 md:px-10">
                    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-full border border-foreground/15 bg-muted/30 px-4 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!voiceSupported || isLoading}
                        onClick={toggleVoiceInput}
                        aria-pressed={isVoiceActive}
                        aria-label={isVoiceActive ? 'Stop voice input' : 'Start voice input'}
                        title={
                          !voiceSupported
                            ? 'Voice input is not supported in this browser'
                            : isVoiceActive
                              ? 'Stop voice input'
                              : 'Start voice input'
                        }
                        className={cn(
                          'h-8 w-8 rounded-full',
                          isVoiceActive && 'bg-red-100 text-red-700 hover:bg-red-100 hover:text-red-700',
                        )}
                      >
                        {isVoiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Textarea
                        placeholder={isVoiceActive ? 'Listening... click Send when finished' : 'Ask anything'}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        disabled={isLoading || isVoiceActive}
                        className="h-9 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base leading-5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <Button type="submit" disabled={!canSend} size="icon" className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </div>
                    {voiceError ? (
                      <p className="mx-auto mt-2 w-full max-w-3xl px-1 text-xs text-red-600">{voiceError}</p>
                    ) : isVoiceActive ? (
                      <p className="mx-auto mt-2 w-full max-w-3xl px-1 text-xs text-muted-foreground">
                        Listening. Speak now, then click Send to submit the transcript.
                      </p>
                    ) : null}
                  </form>
                </section>
                <div
                  className="hidden w-px cursor-col-resize self-stretch bg-border/80 xl:flex"
                  onMouseDown={() => setIsResizing(true)}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize chat and logs panels"
                >
                </div>
                <section
                  className={cn(
                    "flex min-h-0 flex-col bg-card transition-all duration-200 ease-linear",
                    isDesktopSplit
                      ? desktopLogsCollapsed
                        ? "flex-none w-14"
                        : "flex-1"
                      : "flex-none",
                  )}
                  style={
                    isDesktopSplit
                      ? desktopLogsCollapsed
                        ? undefined
                        : { width: `calc(${100 - chatPanePercent}% - 4px)` }
                      : { height: logsCollapsed ? '96px' : 'clamp(240px, 36vh, 420px)' }
                  }
                >
                  {isDesktopSplit && desktopLogsCollapsed ? (
                    <div className="relative flex h-full items-center justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-foreground text-background hover:bg-foreground/90"
                        onClick={toggleLogsPanel}
                        aria-label="Expand logs panel"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Logs
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4 md:px-10">
                        <div className="text-sm font-semibold">{activeSession?.title || 'New Task'} - Logs</div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {activeSession ? `${activeWorkLogs.length} logs` : '0 logs'}
                          </span>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={followLatest}
                              onChange={(event) => setFollowLatest(event.target.checked)}
                            />
                            Follow latest
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={toggleLogsPanel}
                            aria-label={
                              isDesktopSplit
                                ? desktopLogsCollapsed
                                  ? 'Expand logs panel'
                                  : 'Collapse logs panel'
                                : logsCollapsed
                                  ? 'Expand logs panel'
                                  : 'Collapse logs panel'
                            }
                          >
                            {isDesktopSplit
                              ? desktopLogsCollapsed
                                ? <ChevronLeft className="h-4 w-4" />
                                : <ChevronDown className="h-4 w-4" />
                              : logsCollapsed
                                ? <ChevronUp className="h-4 w-4" />
                                : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className={cn("flex-1 overflow-y-auto p-4", !isDesktopSplit && logsCollapsed ? "hidden" : "")}>
                        {!activeSession || activeWorkLogs.length === 0 ? (
                          <div className="pt-16 text-center text-sm text-muted-foreground">Logs will appear here as the task runs</div>
                        ) : (
                          <div className="space-y-1">
                            {activeWorkLogs.map((logItem) => (
                              <div key={logItem.id} className="rounded-md border border-border/60 px-2 py-1.5 text-xs">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <div className="font-mono text-[11px] text-muted-foreground">{formatTimestamp(logItem.createdAt)}</div>
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{logItem.module}</span>
                                </div>
                                <div className="break-words font-medium text-foreground/90">{logItem.activity}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            ) : (
              <section className="flex min-h-[420px] items-center justify-center rounded-lg bg-card px-6">
                <div className="max-w-md text-center">
                  <h3 className="text-lg font-semibold">No Session Selected</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create a new session from the sidebar or select an existing one to start chatting and view execution logs.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
