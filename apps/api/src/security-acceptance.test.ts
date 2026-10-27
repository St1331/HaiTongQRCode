import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { logPath } from './lib/log-path.js';

const app = createApp({
  config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
});

it('blocks cross-origin login before authenticating', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('origin', 'https://attacker.example')
    .send({ username: 'admin', password: 'not-a-real-password' })
    .expect(403);
  expect(response.body.error.code).toBe('ORIGIN_REJECTED');
});
it('blocks cross-site writes even without an Origin header', async () => {
  await request(app)
    .post('/api/v1/auth/login')
    .set('sec-fetch-site', 'cross-site')
    .send({})
    .expect(403);
});
it('reports oversized payloads as 413 with matching request IDs', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ value: 'x'.repeat(270_000) })
    .expect(413);
  expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  expect(response.body.requestId).toBe(response.headers['x-request-id']);
});
it.each([
  [
    '/api/v1/public/records/secret-token?password=secret',
    '/api/v1/public/records/:token',
  ],
  ['/api/v1/auth/login?password=secret', '/api/v1/auth/login'],
  ['/api/v1/admin/records/private-id/qrcode', '/api/v1/admin/records/:id'],
  ['/v/private-token', '/unmatched'],
])('redacts caller-controlled URL data: %s', (url, expected) => {
  expect(logPath(url)).toBe(expected);
});
