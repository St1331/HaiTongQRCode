import { loadConfig } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const dataSource = createDataSource(loadConfig());

try {
  await dataSource.initialize();
  await dataSource.undoLastMigration({ transaction: 'all' });
  console.log('Reverted the latest migration.');
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
