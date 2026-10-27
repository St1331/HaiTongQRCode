import { argon2id, hash } from 'argon2';
import { z } from 'zod';

import { loadConfig } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const input = z
  .object({
    ADMIN_USERNAME: z.string().trim().min(3).max(50).default('admin'),
    ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(100).default('系统管理员'),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  })
  .parse(process.env);

const dataSource = createDataSource(loadConfig());

try {
  await dataSource.initialize();
  const passwordHash = await hash(input.ADMIN_PASSWORD, { type: argon2id });
  await dataSource.query(
    `INSERT INTO users (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'SUPER_ADMIN')
     ON CONFLICT (username) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       password_hash = EXCLUDED.password_hash,
       role = 'SUPER_ADMIN', status = 'ACTIVE',
       password_changed_at = now(), updated_at = now()`,
    [
      input.ADMIN_USERNAME.toLowerCase(),
      input.ADMIN_DISPLAY_NAME,
      passwordHash,
    ],
  );
  console.log(`Administrator ${input.ADMIN_USERNAME.toLowerCase()} is ready.`);
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
