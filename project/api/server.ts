import express, { NextFunction, Request, Response } from 'express';
import { SessionService } from '../modules/session';
import { EventService } from '../modules/event';
import { SessionContext } from '../modules/session';
import { ScmService, ScmWebhookService } from '../modules/scm';
import { UserIntakeService } from '../modules/intake';
import { Logger } from '../modules/utils/logger';
import { AuthService, PublicUser } from '../modules/auth';
import { CommandQueue } from '../modules/infra';

interface CreateSessionBody {
  goal?: unknown;
  context?: SessionContext | unknown;
  autoStart?: unknown;
}

interface StreamQuery {
  sessionId?: string;
  type?: string;
  level?: string;
}

interface RenameSessionBody {
  title?: unknown;
}

interface AuthBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

const AUTH_COOKIE_NAME = 'asf_auth_token';

/**
 * Creates the Express API app with session endpoints.
 *
 * @param deps Server dependencies.
 * @param deps.sessionService Session service.
 * @param deps.logger Logger provider.
 * @param deps.sessionQueue Queue for enqueueing session IDs for workers.
 * @returns Configured Express app.
 */
export function createApiServer({
  authService,
  sessionService,
  eventService,
  userIntakeService,
  logger,
  scmWebhookService,
  scmService,
  sessionQueue,
}: {
  authService: AuthService;
  sessionService: SessionService;
  eventService: EventService;
  userIntakeService: UserIntakeService;
  logger: Logger;
  scmWebhookService: ScmWebhookService;
  scmService: ScmService;
  sessionQueue: CommandQueue;
}) {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    })
  );

  /**
   * Wraps async route handlers so thrown errors are forwarded to Express error middleware.
   *
   * @param handler Async route handler.
   * @returns Express middleware that forwards rejected promises to `next`.
   */
  const wrap =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void handler(req, res).catch(next);
    };

  const readAuthToken = (req: Request): string => {
    const authHeader = req.header('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    const cookieHeader = req.header('cookie') || '';
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [rawName, ...rest] = part.trim().split('=');
      if (rawName === AUTH_COOKIE_NAME) {
        return decodeURIComponent(rest.join('=') || '').trim();
      }
    }
    return '';
  };

  const authenticateRequest = async (req: Request, res: Response): Promise<PublicUser | null> => {
    const token = readAuthToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return null;
    }
    const user = await authService.getAuthenticatedUser(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return null;
    }
    return user;
  };

  app.post('/auth/register', wrap(async (req: Request<unknown, unknown, AuthBody>, res) => {
    const body = req.body || {};
    if (typeof body.name !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') {
      res.status(400).json({ error: 'Fields `name`, `email`, and `password` are required.' });
      return;
    }
    try {
      const result = await authService.register({
        name: body.name,
        email: body.email,
        password: body.password,
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Register failed.';
      res.status(400).json({ error: message });
    }
  }));

  app.post('/auth/login', wrap(async (req: Request<unknown, unknown, AuthBody>, res) => {
    const body = req.body || {};
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      res.status(400).json({ error: 'Fields `email` and `password` are required.' });
      return;
    }
    try {
      const result = await authService.login({
        email: body.email,
        password: body.password,
      });
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.';
      res.status(401).json({ error: message });
    }
  }));

  app.get('/auth/me', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    res.status(200).json({ user });
  }));

  app.post('/auth/logout', wrap(async (req, res) => {
    const token = readAuthToken(req);
    if (token) {
      await authService.logout(token);
    }
    res.status(200).json({ ok: true });
  }));

  /**
   * POST /sessions
   * Creates a new workflow session from user goal/context.
   * Optional `autoStart=true` creates then immediately starts the session.
   */
  app.post('/sessions', wrap(async (req, res) => {
    const body = (req.body || {}) as CreateSessionBody;
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    if (!body.goal || typeof body.goal !== 'string') {
      res.status(400).json({ error: 'Field `goal` is required.' });
      return;
    }
    const context = typeof body.context === 'object' && body.context !== null
      ? body.context as Record<string, unknown>
      : {};
    const mergedContext = {
      ...context,
      metadata: {
        ...(typeof context.metadata === 'object' && context.metadata !== null ? context.metadata as Record<string, unknown> : {}),
        userId: user.id,
      },
    };
    const session = await sessionService.createSession(body.goal, mergedContext);
    const autoStart = body.autoStart === true;
    if (!autoStart) {
      res.status(201).json(session);
      return;
    }

    const started = await sessionService.startSession(session.id);
    if (!started) {
      res.status(500).json({ error: 'Failed to auto-start session.' });
      return;
    }
    
    // Enqueue session for worker to process
    await sessionQueue.enqueue(session.id);
    logger.info('session enqueued for processing', { sessionId: session.id });
    
    const view = await sessionService.getSessionView(session.id);
    if (!view) {
      res.status(500).json({ error: 'Failed to load started session view.' });
      return;
    }
    res.status(201).json(view);
  }));

  /**
   * POST /intake/requests
   * Converts user message to a structured request and executes it.
   */
  app.post('/intake/requests', wrap(async (req, res) => {
    const body = (req.body || {}) as { message?: unknown; threadId?: unknown };
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    if (typeof body.message !== 'string' || !body.message.trim()) {
      res.status(400).json({ error: 'Field `message` is required.' });
      return;
    }

    const threadId = typeof body.threadId === 'string' ? body.threadId : undefined;
    const result = await userIntakeService.handleMessage(
      body.message,
      threadId,
      { metadata: { userId: user.id } },
    );
    
    // If a task session was started, enqueue it for worker processing
    if (result.kind === 'task' && result.sessionId && result.status === 'RUNNING') {
      await sessionQueue.enqueue(result.sessionId);
      logger.info('session enqueued for processing', { sessionId: result.sessionId });
    }
    
    res.status(200).json(result);
  }));

  /**
   * POST /sessions/:id/start
   * Starts an existing session and triggers orchestration.
   */
  app.post('/sessions/:id/start', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const sessionId = String(req.params.id);
    const session = await sessionService.startSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    
    // Enqueue session for worker to process
    await sessionQueue.enqueue(sessionId);
    logger.info('session enqueued for processing', { sessionId });
    
    const view = await sessionService.getSessionView(sessionId);
    res.status(200).json(view);
  }));

  /**
   * POST /sessions/:id/scm-sync
   * Actively refreshes SCM feedback for the session's current pull request.
   */
  app.post('/sessions/:id/scm-sync', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }

    const sessionId = String(req.params.id || '').trim();
    if (!sessionId) {
      res.status(400).json({ error: 'Session id is required.' });
      return;
    }

    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    logger.info('scm sync requested', {
      sessionId,
      userId: user.id,
      hasScmContext: Boolean(session.context?.scm),
    });

    const scm = session.context?.scm;
    const publish = scm && typeof scm === 'object' ? scm.publish : undefined;
    const pullRequest = publish && typeof publish === 'object' ? publish.pullRequest : undefined;
    const provider = scm?.provider;
    const repoUrl = scm?.repoUrl;

    if (!provider || !repoUrl || !pullRequest?.number) {
      logger.info('scm sync skipped - missing pull request binding', {
        sessionId,
        hasProvider: Boolean(provider),
        hasRepoUrl: Boolean(repoUrl),
        hasPullRequest: Boolean(pullRequest),
      });
      res.status(400).json({ error: 'Session does not have an active SCM pull request to sync.' });
      return;
    }

    const repository = scmService.parseRepository({ provider, repoUrl });
    logger.info('scm sync collecting feedback', {
      sessionId,
      provider,
      repoUrl,
      pullRequestNumber: pullRequest.number,
      sourceBranch: pullRequest.sourceBranch || '',
      targetBranch: pullRequest.targetBranch || '',
    });
    const feedback = await scmService.collectPullRequestFeedback({
      repo: repository,
      token: scm?.token,
      pullRequest: {
        id: pullRequest.id,
        number: pullRequest.number,
        url: pullRequest.url,
        title: session.goal,
        sourceBranch: pullRequest.sourceBranch || '',
        targetBranch: pullRequest.targetBranch || '',
      },
    });

    logger.info('scm sync collected feedback', {
      sessionId,
      pipelineFailureCount: feedback.pipelineFailures.length,
      reviewCommentCount: feedback.reviewComments.length,
    });

    if (feedback.pipelineFailures.length > 0) {
      logger.info('scm sync emitting pipeline failure event', {
        sessionId,
        pullRequestNumber: pullRequest.number,
        failureCount: feedback.pipelineFailures.length,
      });
      await eventService.emit({
        sessionId,
        type: 'SCM_PIPELINE_FAILED',
        payload: {
          failures: feedback.pipelineFailures,
          pullRequestNumber: pullRequest.number,
        },
      });
    } else {
      logger.info('scm sync emitting pipeline passed event', {
        sessionId,
        pullRequestNumber: pullRequest.number,
      });
      await eventService.emit({
        sessionId,
        type: 'SCM_PIPELINE_PASSED',
        payload: {
          pullRequestNumber: pullRequest.number,
        },
      });
    }

    if (feedback.reviewComments.length > 0) {
      logger.info('scm sync emitting review comment event', {
        sessionId,
        pullRequestNumber: pullRequest.number,
        commentCount: feedback.reviewComments.length,
      });
      await eventService.emit({
        sessionId,
        type: 'SCM_REVIEW_COMMENT_ADDED',
        payload: {
          comments: feedback.reviewComments,
          pullRequestNumber: pullRequest.number,
        },
      });
    }

    logger.info('scm sync emitting sync-complete event', {
      sessionId,
      pipelineFailureCount: feedback.pipelineFailures.length,
      reviewCommentCount: feedback.reviewComments.length,
    });
    await eventService.emit({
      sessionId,
      type: 'SCM_FEEDBACK_SYNCED',
      payload: {
        pipelineFailures: feedback.pipelineFailures,
        reviewComments: feedback.reviewComments,
      },
    });

    logger.info('scm sync completed', {
      sessionId,
      pipelineFailureCount: feedback.pipelineFailures.length,
      reviewCommentCount: feedback.reviewComments.length,
    });

    res.status(200).json({
      sessionId,
      pipelineFailures: feedback.pipelineFailures,
      reviewComments: feedback.reviewComments,
    });
  }));

  /**
   * PATCH /sessions/:id
   * Updates mutable session properties (currently title).
   */
  app.patch('/sessions/:id', wrap(async (req, res) => {
    const body = (req.body || {}) as RenameSessionBody;
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const sessionId = String(req.params.id || '').trim();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!sessionId) {
      res.status(400).json({ error: 'Session id is required.' });
      return;
    }
    if (!title) {
      res.status(400).json({ error: 'Field `title` is required.' });
      return;
    }
    const renamed = await sessionService.renameSession(sessionId, title);
    if (!renamed) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    const view = await sessionService.getSessionView(sessionId);
    res.status(200).json({
      sessionId,
      title,
      view,
    });
  }));

  /**
   * GET /sessions/:id
   * Returns the session projection view with progress/state.
   */
  app.get('/sessions/:id', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const view = await sessionService.getSessionView(String(req.params.id));
    if (!view) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.status(200).json(view);
  }));

  /**
   * GET /sessions/:id/events
   * Returns emitted event history for a session.
   */
  app.get('/sessions/:id/events', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const events = await sessionService.getEvents(String(req.params.id));
    res.status(200).json(events);
  }));

  /**
   * GET /sessions/:id/stream
   * Streams live session events/logs via Server-Sent Events.
   */
  app.get('/sessions/:id/stream', wrap(async (req, res) => {
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const sessionId = String(req.params.id);
    const view = await sessionService.getSessionView(sessionId);
    if (!view) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (event: { id: string; type: string; createdAt: number; payload: Record<string, unknown> }) => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const existingEvents = await eventService.listBySessionId(sessionId);
    for (const event of existingEvents) {
      writeEvent(event);
    }

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15000);

    const unsubscribe = await eventService.subscribe(async (event) => {
      if (event.sessionId !== sessionId) {
        return;
      }
      writeEvent(event);
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      void unsubscribe();
      res.end();
    });
  }));

  /**
   * GET /streams/events
   * Streams live events across sessions, with optional filters.
   * Query params:
   * - sessionId: restrict to one session id
   * - type: restrict to one event type
   * - level: for LOG_EMITTED payload level filter (info|error)
   */
  app.get('/streams/events', wrap(async (req, res) => {
    const query = (req.query || {}) as StreamQuery;
    const user = await authenticateRequest(req, res);
    if (!user) {
      return;
    }
    const filterSessionId = typeof query.sessionId === 'string' ? query.sessionId.trim() : '';
    const filterType = typeof query.type === 'string' ? query.type.trim() : '';
    const filterLevel = typeof query.level === 'string' ? query.level.trim().toLowerCase() : '';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const shouldEmit = (event: { sessionId: string; type: string; payload: Record<string, unknown> }) => {
      if (filterSessionId && event.sessionId !== filterSessionId) {
        return false;
      }
      if (filterType && event.type !== filterType) {
        return false;
      }
      if (filterLevel) {
        const level = typeof event.payload.level === 'string' ? event.payload.level.toLowerCase() : '';
        if (!level || level !== filterLevel) {
          return false;
        }
      }
      return true;
    };

    const writeEvent = (event: { id: string; type: string; createdAt: number; payload: Record<string, unknown>; sessionId: string }) => {
      if (!shouldEmit(event)) {
        return;
      }
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15000);

    const unsubscribe = await eventService.subscribe(async (event) => {
      writeEvent(event);
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      void unsubscribe();
      res.end();
    });
  }));

  /**
   * GET /health
   * Liveness probe endpoint for runtime health checks.
   */
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  /**
   * POST /webhooks/github
   * Receives GitHub webhook events and emits normalized internal SCM events.
   */
  app.post('/webhooks/github', wrap(async (req, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const result = await scmWebhookService.handleWebhook({
      provider: 'github',
      headers: req.headers,
      rawBody,
      body: req.body,
    });
    if (!result.accepted) {
      res.status(401).json({ error: result.reason || 'Webhook rejected' });
      return;
    }
    res.status(202).json({ ok: true, reason: result.reason });
  }));

  /**
   * POST /webhooks/azure-devops
   * Receives Azure DevOps webhook events and emits normalized internal SCM events.
   */
  app.post('/webhooks/azure-devops', wrap(async (req, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const result = await scmWebhookService.handleWebhook({
      provider: 'azure-devops',
      headers: req.headers,
      rawBody,
      body: req.body,
    });
    if (!result.accepted) {
      res.status(401).json({ error: result.reason || 'Webhook rejected' });
      return;
    }
    res.status(202).json({ ok: true, reason: result.reason });
  }));

  /**
   * Catch-all 404 handler for unknown routes.
   */
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  /**
   * Global error handler for uncaught route/middleware errors.
   */
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('api error', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
