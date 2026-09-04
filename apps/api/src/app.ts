import { randomUUID } from 'node:crypto';

import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import type { DataSource } from 'typeorm';

import { APP_NAME } from '@haitong/shared';

import type { AppConfig } from './config/env.js';
import { AppError } from './lib/app-error.js';
import { createAuditRouter } from './routes/audit.js';
import { createAuthRouter } from './routes/auth.js';
import { createPublicRouter } from './routes/public.js';
import { createRecordsRouter } from './routes/records.js';
import { createUsersRouter } from './routes/users.js';

export interface CreateAppOptions {
  config: AppConfig;
  dataSource?: DataSource;
  logger?: Logger;
}

function createRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '')}`;
}

export function createApp({ config, dataSource, logger }: CreateAppOptions) {
  const appLogger =
    logger ??
    pino({
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
        ],
        censor: '[REDACTED]',
      },
    });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS || false);
  app.use(
    pinoHttp({
      logger: appLogger,
      genReqId: () => createRequestId(),
      serializers: {
        req: (request) => ({
          id: request.id,
          method: request.method,
          url: request.url,
        }),
        res: (response) => ({ statusCode: response.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use(((request, response, next) => {
    const requestId = String(request.id || createRequestId());
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }) satisfies RequestHandler);

  app.get('/api/v1/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: APP_NAME,
      version: '0.1.0',
      requestId: response.locals.requestId as string,
    });
  });

  if (dataSource) {
    app.get('/api/v1/ready', async (_request, response, next) => {
      try {
        await dataSource.query('SELECT 1');
        response.status(200).json({
          status: 'ready',
          service: APP_NAME,
          requestId: response.locals.requestId as string,
        });
      } catch {
        next(new AppError(503, 'DATABASE_UNAVAILABLE', '数据库暂不可用'));
      }
    });
    app.use('/api/v1/auth', createAuthRouter(dataSource, config));
    app.use('/api/v1/admin/users', createUsersRouter(dataSource, config));
    app.use('/api/v1/admin/records', createRecordsRouter(dataSource, config));
    app.use('/api/v1/admin/audit-logs', createAuditRouter(dataSource, config));
    app.use('/api/v1/public', createPublicRouter(dataSource, config));
  }

  app.use(((request, _response, next) => {
    next(
      new AppError(
        404,
        'ROUTE_NOT_FOUND',
        `Route ${request.method} ${request.path} was not found`,
      ),
    );
  }) satisfies RequestHandler);

  app.use(((error, request, response, _next) => {
    void _next;
    const requestId =
      (response.locals.requestId as string | undefined) ?? createRequestId();
    const normalizedError =
      error instanceof ZodError
        ? new AppError(
            400,
            'VALIDATION_ERROR',
            '请求参数校验失败',
            error.flatten(),
          )
        : error instanceof SyntaxError && 'body' in error
          ? new AppError(400, 'INVALID_JSON', '请求内容不是有效的 JSON')
          : error instanceof AppError
            ? error
            : new AppError(500, 'INTERNAL_ERROR', '服务器内部错误');

    if (normalizedError.statusCode >= 500) {
      request.log.error(
        {
          requestId,
          errorType:
            error instanceof Error ? error.constructor.name : 'UnknownError',
        },
        'Unhandled request error',
      );
    }

    response.status(normalizedError.statusCode).json({
      error: {
        code: normalizedError.code,
        message: normalizedError.message,
        details: normalizedError.details,
      },
      requestId,
    });
  }) satisfies ErrorRequestHandler);

  return app;
}
