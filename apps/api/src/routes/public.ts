import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { DataSource } from 'typeorm';

import { publicTokenSchema } from '@haitong/shared';

import type { AppConfig } from '../config/env.js';
import type { VerificationRecordRow } from '../db/types.js';
import { AppError } from '../lib/app-error.js';
import { publicRecordDto } from '../lib/record.js';

export function createPublicRouter(dataSource: DataSource, config: AppConfig) {
  const router = Router();
  const rateLimitHandler: NonNullable<
    Parameters<typeof rateLimit>[0]
  >['handler'] = (_request, response, _next, options) => {
    response.status(options.statusCode).json({
      error: {
        code: 'PUBLIC_RATE_LIMITED',
        message: '查询过于频繁，请稍后再试',
        details: null,
      },
      requestId: response.locals.requestId as string,
    });
  };
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.PUBLIC_IP_RATE_LIMIT,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
  );

  const tokenLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.PUBLIC_TOKEN_RATE_LIMIT,
    identifier: 'public-token',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => String(request.params.publicToken ?? ''),
    validate: { keyGeneratorIpFallback: false },
    handler: rateLimitHandler,
  });

  router.get(
    '/records/:publicToken',
    tokenLimiter,
    async (request, response, next) => {
      try {
        const tokenResult = publicTokenSchema.safeParse(
          request.params.publicToken,
        );
        if (!tokenResult.success)
          throw new AppError(404, 'RECORD_NOT_FOUND', '未找到可核验记录');
        const rows = (await dataSource.query(
          `SELECT * FROM verification_records
          WHERE public_token = $1 AND status IN ('ACTIVE', 'CHANGED', 'VOID')
            AND deleted_at IS NULL LIMIT 1`,
          [tokenResult.data],
        )) as VerificationRecordRow[];
        const record = rows[0];
        if (!record)
          throw new AppError(404, 'RECORD_NOT_FOUND', '未找到可核验记录');
        response.setHeader('cache-control', 'public, max-age=0, s-maxage=60');
        response.json({
          data: publicRecordDto(record, config.PUBLISH_CONTRACT_AMOUNT),
          requestId: response.locals.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
