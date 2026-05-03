
import { SessionView, buildSessionView } from './session-view';
import { createId } from '../utils/id';
import { getCurrentStep, getProgress } from '../utils/progress';
import { nowTs } from '../utils/time';
import { EventService } from '../event';
import { TaskService } from '../task';
import { SessionRepo } from './types/session-repo';
import { Session, SessionStatus } from './types/session';
import { EventRecord } from '../event/types/event';
import { normalizeSessionContext, SessionContext } from './types/context';



interface SessionDeps {
  sessionRepo: SessionRepo;
  taskService: TaskService;
  eventService: EventService;
}

/**
 * Session management service and session view projection.
 */
export class SessionService {
  /**
   * @param deps Service dependencies.
   */
  constructor(private readonly deps: SessionDeps) {}

  /**
   * Creates a new session.
   *
   * @param goal Session goal text.
   * @param context Optional arbitrary session context.
   * @returns Created session record.
   */
  async createSession(goal: string, context?: SessionContext | unknown): Promise<Session> {
    const ts = nowTs();
    const session: Session = {
      id: createId('sess'),
      goal,
      status: SessionStatus.CREATED,
      context: normalizeSessionContext(context),
      createdAt: ts,
      updatedAt: ts,
    };
    return this.deps.sessionRepo.create(session);
  }

  /**
   * Starts a session and emits SESSION_STARTED.
   *
   * @param sessionId Session identifier.
   * @returns Updated session, or null if not found.
   */
  async startSession(sessionId: string): Promise<Session | null> {
    const session = await this.deps.sessionRepo.getById(sessionId);
    if (!session) {
      return null;
    }
    if (session.status === SessionStatus.COMPLETED) {
      return session;
    }
    const updated = await this.deps.sessionRepo.update(sessionId, {
      status: SessionStatus.RUNNING,
      updatedAt: nowTs(),
    });

    await this.deps.eventService.emit({
      sessionId,
      type: 'SESSION_STARTED',
      payload: {},
    });

    return updated;
  }

  /**
   * Builds session view including progress derived from tasks.
   *
   * @param sessionId Session identifier.
   * @returns Session view, or null if session does not exist.
   */
  async getSessionView(sessionId: string): Promise<SessionView | null> {
    const session = await this.deps.sessionRepo.getById(sessionId);
    if (!session) {
      return null;
    }
    const tasks = await this.deps.taskService.listBySessionId(sessionId);
    return buildSessionView(session, tasks, getCurrentStep(tasks), getProgress(tasks));
  }

  /**
   * Returns the raw session record.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.deps.sessionRepo.getById(sessionId);
  }

  /**
   * Lists emitted events for a session.
   *
   * @param sessionId Session identifier.
   * @returns Event records for this session.
   */
  async getEvents(sessionId: string): Promise<EventRecord[]> {
    return this.deps.eventService.listBySessionId(sessionId);
  }

  /**
   * Renames a session by storing title in session context metadata.
   *
   * @param sessionId Session identifier.
   * @param title User-facing title.
   * @returns Updated session, or null when not found.
   */
  async renameSession(sessionId: string, title: string): Promise<Session | null> {
    const session = await this.deps.sessionRepo.getById(sessionId);
    if (!session) {
      return null;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error('Session title is required.');
    }
    const context = session.context && typeof session.context === 'object'
      ? { ...session.context }
      : {};
    const metadata = context.metadata && typeof context.metadata === 'object'
      ? { ...context.metadata }
      : {};
    metadata.title = trimmed;
    context.metadata = metadata;
    return this.deps.sessionRepo.update(sessionId, {
      context,
      updatedAt: nowTs(),
    });
  }
}
