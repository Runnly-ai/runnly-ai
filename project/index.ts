import { createApiServer } from './api/server';
import { getAppConfig } from './config/app-config';
import { createApplication } from './runtime';
import { Server } from 'node:http';

/**
 * Process entrypoint.
 *
 * @returns Promise resolved when startup wiring completes.
 */
async function main(): Promise<void> {
  const config = getAppConfig();
  const app = await createApplication(config, { enableIntakeAgent: true });
  await app.workspace.init('local');
  if (!app.services.userIntakeService) {
    throw new Error('User intake service is not initialized for API process.');
  }

  const server = createApiServer({
    authService: app.services.authService,
    sessionService: app.services.sessionService,
    eventService: app.services.eventService,
    userIntakeService: app.services.userIntakeService,
    logger: app.logger,
    scmWebhookService: app.services.scmWebhookService,
  });

  const listener: Server = server.listen(config.port, () => {
    app.logger.info(`API listening on http://localhost:${config.port}`);
    if (config.logWorkflowProgress) {
      app.logger.info('workflow progress logging enabled', {
        runWorker: config.runWorker,
        runOrchestrator: config.runOrchestrator,
        queueBackend: config.queueBackend,
        eventBusBackend: config.eventBusBackend,
        stateBackend: config.stateBackend,
      });
    }
    if (config.logAgentDebug) {
      app.logger.info('agent debug logging enabled');
    }
  });

  /**
   * Gracefully stops HTTP listener, runtime services, and workspace resources.
   *
   * @returns Promise resolved when shutdown sequence completes.
   */
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async (signal?: string) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      app.logger.info('Shutting down...', { signal: signal || 'unknown' });

      // Avoid piling up repeated close listeners if multiple signals arrive.
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);

      // Force-exit as a last resort (prevents hangs on stuck cleanup).
      const forceTimer = setTimeout(() => {
        app.logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000);
      forceTimer.unref();

      try {
        await new Promise<void>((resolve, reject) => {
          listener.close((error?: Error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      } catch (error: unknown) {
        app.logger.error('HTTP listener close failed', { error });
      }

      try {
        await app.stop();
      } catch (error: unknown) {
        app.logger.error('Application stop failed', { error });
      }

      try {
        await app.workspace.cleanup();
      } catch (error: unknown) {
        app.logger.error('Workspace cleanup failed', { error });
      }

      process.exit(0);
    })();

    return shutdownPromise;
  };

  const onSigint = () => void shutdown('SIGINT');
  const onSigterm = () => void shutdown('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
