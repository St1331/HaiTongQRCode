import { describe, expect, it } from 'vitest';

import { loadConfig } from './config/env.js';

describe('environment configuration', () => {
  it('provides safe development defaults for non-secret settings', () => {
    expect(loadConfig({})).toMatchObject({
      API_PORT: 3001,
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
      PUBLIC_BASE_URL: 'http://localhost:3000',
    });
  });

  it('rejects an invalid API port', () => {
    expect(() => loadConfig({ API_PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('rejects development secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      '生产环境必须配置独立会话密钥',
    );
  });
});
