import 'reflect-metadata';

import { DataSource } from 'typeorm';
import pino from 'pino';

import type { AppConfig } from '../config/env.js';
import { InitialSchema1788426000000 } from './migrations/1788426000000-initial-schema.js';
import { SearchAndAuditIndexes1788498000000 } from './migrations/1788498000000-search-and-audit-indexes.js';
import { VariableLengthHashColumns1788499000000 } from './migrations/1788499000000-variable-length-hash-columns.js';
import { AppendOnlyAudit1788750000000 } from './migrations/1788750000000-append-only-audit.js';

export function createDataSource(config: AppConfig): DataSource {
  const logger = pino({ level: config.LOG_LEVEL });
  return new DataSource({
    type: 'postgres',
    url: config.DATABASE_URL,
    synchronize: false,
    migrationsRun: false,
    logging: config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    logger: {
      logQuery: () => logger.debug({ event: 'DATABASE_QUERY' }),
      logQueryError: () => logger.error({ event: 'DATABASE_QUERY_FAILED' }),
      logQuerySlow: (time) =>
        logger.warn({ event: 'DATABASE_SLOW_QUERY', durationMs: time }),
      logSchemaBuild: () => logger.info({ event: 'DATABASE_SCHEMA_BUILD' }),
      logMigration: () => logger.info({ event: 'DATABASE_MIGRATION' }),
      log: (level) => logger.info({ event: 'DATABASE_LOG', level }),
    },
    migrationsTableName: 'typeorm_migrations',
    migrations: [
      InitialSchema1788426000000,
      SearchAndAuditIndexes1788498000000,
      VariableLengthHashColumns1788499000000,
      AppendOnlyAudit1788750000000,
    ],
  });
}
