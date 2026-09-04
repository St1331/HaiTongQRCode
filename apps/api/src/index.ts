import { createServer } from 'node:http';

import pino from 'pino';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDataSource } from './db/data-source.js';

const config = loadConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-csrf-token',
      'res.headers.set-cookie',
    ],
    censor: '[REDACTED]',
  },
});
const dataSource = createDataSource(config);
await dataSource.initialize();
const app = createApp({ config, dataSource, logger });
const server = createServer(app);

server.listen(config.API_PORT, () => {
  logger.info({ port: config.API_PORT }, 'HaiTongQRcode API listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down API');
  server.close((error) => {
    void dataSource
      .destroy()
      .catch((databaseError: unknown) => {
        logger.error(
          {
            errorType:
              databaseError instanceof Error
                ? databaseError.constructor.name
                : 'UnknownError',
          },
          'Database shutdown failed',
        );
        process.exitCode = 1;
      })
      .finally(() => {
        if (error) {
          logger.error(
            { errorType: error.constructor.name },
            'API shutdown failed',
          );
          process.exitCode = 1;
        }
      });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
