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

  it('rejects reused HMAC keys', () => {
    expect(() =>
      loadConfig({
        SESSION_HMAC_SECRET: 'x'.repeat(32),
        IP_HMAC_SECRET: 'x'.repeat(32),
      }),
    ).toThrow('密钥必须不同');
  });

  it('requires HTTPS for non-local production and permits explicitly configured local tests', () => {
    const secrets = {
      NODE_ENV: 'production',
      SESSION_HMAC_SECRET: 'a'.repeat(32),
      IP_HMAC_SECRET: 'b'.repeat(32),
    };
    expect(() =>
      loadConfig({
        ...secrets,
        PUBLIC_BASE_URL: 'http://example.com',
        ALLOW_LOCAL_HTTP: 'true',
      }),
    ).toThrow('必须使用 HTTPS');
    expect(() =>
      loadConfig({ ...secrets, PUBLIC_BASE_URL: 'http://localhost:8080' }),
    ).toThrow('必须使用 HTTPS');
    expect(
      loadConfig({
        ...secrets,
        PUBLIC_BASE_URL: 'http://localhost:8080',
        ALLOW_LOCAL_HTTP: 'true',
      }).ALLOW_LOCAL_HTTP,
    ).toBe(true);
    expect(() =>
      loadConfig({
        ...secrets,
        PUBLIC_BASE_URL: 'https://example.com',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('Secure Cookie');
    expect(
      loadConfig({
        ...secrets,
        PUBLIC_BASE_URL: 'https://example.com',
        COOKIE_SECURE: 'true',
      }).COOKIE_SECURE,
    ).toBe(true);
  });

  it.each([
    'https://user:pass@example.com',
    'ftp://example.com',
    'https://example.com/path',
    'https://example.com?secret=value',
  ])('rejects unsafe public base URL %s', (value) => {
    expect(() => loadConfig({ PUBLIC_BASE_URL: value })).toThrow(
      '公开地址必须',
    );
  });
});
