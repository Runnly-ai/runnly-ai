import { getAppConfig } from '../config/app-config';
import { createWorkerApplication } from './application';

async function main(): Promise<void> {
  const config = getAppConfig();
  const app = await createWorkerApplication(config);

  app.logger.info('process role started', {
    role: 'worker',
    pollMs: config.workerPollMs,
    queueBackend: config.queueBackend,
    eventBusBackend: config.eventBusBackend,
    stateBackend: config.stateBackend,
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

      // Give worker 30 seconds to finish current session gracefully
      const forceTimer = setTimeout(() => {
        app.logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 5_000);
      forceTimer.unref();

      try {
        await app.stop();
      } catch (error: unknown) {
        app.logger.error('Application stop failed', { error });
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
