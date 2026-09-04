import { loadConfig } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const dataSource = createDataSource(loadConfig());

try {
  await dataSource.initialize();
  const migrations = await dataSource.runMigrations({ transaction: 'all' });
  console.log(`Applied ${migrations.length} migration(s).`);
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
