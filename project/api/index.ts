import { Server } from 'node:http';
import { createApiServer } from './server';
import { getAppConfig } from '../config/app-config';
import { createApiApplication } from './application';

async function main(): Promise<void> {
  const config = getAppConfig();
  const app = await createApiApplication(config);
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
    app.logger.info('process role started', {
      role: 'api',
      runWorker: false,
      runOrchestrator: false,
      queueBackend: config.queueBackend,
      eventBusBackend: config.eventBusBackend,
      stateBackend: config.stateBackend,
    });
  });

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async (signal?: string) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      app.logger.info('Shutting down...', { signal: signal || 'unknown' });
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);

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
