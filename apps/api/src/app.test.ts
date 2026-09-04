import pino from 'pino';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const testConfig = loadConfig({
  LOG_LEVEL: 'silent',
  NODE_ENV: 'test',
});

describe('API application', () => {
  const app = createApp({
    config: testConfig,
    logger: pino({ enabled: false }),
  });

  it('returns a healthy response with a request ID', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'HaiTongQRcode',
      version: '0.1.0',
      requestId: response.headers['x-request-id'],
    });
  });

  it('uses the stable error envelope for unknown routes', async () => {
    const response = await request(app).get('/missing').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /missing was not found',
        details: null,
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('sets baseline security headers', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('protects every admin record route by default', async () => {
    const dataSource = { query: vi.fn() } as unknown as DataSource;
    const protectedApp = createApp({
      config: testConfig,
      dataSource,
      logger: pino({ enabled: false }),
    });
    const response = await request(protectedApp)
      .get('/api/v1/admin/records')
      .expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(response.body.requestId).toMatch(/^req_/);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns a whitelisted public DTO for a published record', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([
        {
          id: 'internal-id',
          record_type: 'TENDER_DOCUMENT',
          public_token: 'a'.repeat(32),
          record_number: 'HT-001',
          title: '公开招标文件',
          issuer_name: '海通公司',
          document_version: 'V1',
          status: 'ACTIVE',
          business_date: '2026-09-03',
          file_sha256: null,
          public_remark: null,
          internal_note: '不得公开',
          tenderer_name: '海通公司',
          agency_name: null,
          project_type: '工程',
          publish_date: '2026-09-03',
          counterparty_name: null,
          amount_display: null,
          signed_date: null,
          valid_from: null,
          valid_until: null,
          revision: 1,
          created_by: 'internal-user',
          updated_by: 'internal-user',
          created_at: new Date(),
          updated_at: new Date('2026-09-03T08:00:00Z'),
          deleted_at: null,
        },
      ]),
    } as unknown as DataSource;
    const publicApp = createApp({
      config: testConfig,
      dataSource,
      logger: pino({ enabled: false }),
    });
    const response = await request(publicApp)
      .get(`/api/v1/public/records/${'a'.repeat(32)}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      recordNumber: 'HT-001',
      status: 'ACTIVE',
    });
    expect(response.body.data).not.toHaveProperty('id');
    expect(response.body.data).not.toHaveProperty('internalNote');
    expect(response.headers['cache-control']).toContain('s-maxage=60');
  });

  it('never serializes authentication headers or cookies into request logs', async () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const loggedApp = createApp({
      config: testConfig,
      logger: pino(destination),
    });
    await request(loggedApp)
      .get('/api/v1/health')
      .set('authorization', 'Bearer should-never-appear')
      .set('cookie', 'ht_session=should-never-appear')
      .set('x-csrf-token', 'should-never-appear')
      .expect(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(output).not.toContain('should-never-appear');
    expect(output).not.toContain('authorization');
    expect(output).not.toContain('cookie');
  });
});
import { Writable } from 'node:stream';
