import 'reflect-metadata';

import { DataSource } from 'typeorm';

import type { AppConfig } from '../config/env.js';
import { InitialSchema1788426000000 } from './migrations/1788426000000-initial-schema.js';
import { SearchAndAuditIndexes1788498000000 } from './migrations/1788498000000-search-and-audit-indexes.js';
import { VariableLengthHashColumns1788499000000 } from './migrations/1788499000000-variable-length-hash-columns.js';

export function createDataSource(config: AppConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    url: config.DATABASE_URL,
    synchronize: false,
    migrationsRun: false,
    logging: config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    migrationsTableName: 'typeorm_migrations',
    migrations: [
      InitialSchema1788426000000,
      SearchAndAuditIndexes1788498000000,
      VariableLengthHashColumns1788499000000,
    ],
  });
}
