import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import request from 'supertest';
import { argon2id, hash } from 'argon2';
import type { DataSource } from 'typeorm';

import { createApp } from '../app.js';
import { loadConfig, type AppConfig } from '../config/env.js';
import { createDataSource } from '../db/data-source.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('PostgreSQL integration', () => {
  let dataSource: DataSource;
  let config: AppConfig;

  beforeAll(async () => {
    config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: databaseUrl,
      SESSION_HMAC_SECRET: 'integration-session-secret-at-least-32-characters',
      IP_HMAC_SECRET: 'integration-ip-secret-at-least-32-characters-now',
    });
    dataSource = createDataSource(config);
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'all' });
    await dataSource.query(
      'TRUNCATE audit_logs, record_versions, verification_records, auth_sessions, users CASCADE',
    );
    const passwordHash = await hash('Integration-password-2026!', {
      type: argon2id,
    });
    await dataSource.query(
      `INSERT INTO users (username, display_name, password_hash, role)
       VALUES ('admin', '集成测试管理员', $1, 'SUPER_ADMIN')`,
      [passwordHash],
    );
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('completes registration, publication, verification and conflict protection', async () => {
    const app = createApp({ config, dataSource });
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Integration-password-2026!' })
      .expect(200);
    const csrf = login.body.csrfToken as string;

    const created = await agent
      .post('/api/v1/admin/records')
      .set('x-csrf-token', csrf)
      .send({
        recordType: 'CONTRACT',
        recordNumber: 'CI-HT-001',
        title: '集成测试合同',
        issuerName: '海通测试公司',
        documentVersion: 'V1.0',
        businessDate: '2026-09-04',
        counterpartyName: '测试合作方',
        amountDisplay: '人民币壹佰万元',
        signedDate: '2026-09-04',
        internalNote: '内部字段不得公开',
      })
      .expect(201);

    await request(app)
      .get(`/api/v1/public/records/${created.body.data.publicToken}`)
      .expect(404);

    const published = await agent
      .post(`/api/v1/admin/records/${created.body.data.id}/status`)
      .set('x-csrf-token', csrf)
      .send({ revision: 1, status: 'ACTIVE' })
      .expect(200);

    const verified = await request(app)
      .get(`/api/v1/public/records/${created.body.data.publicToken}`)
      .expect(200);
    expect(verified.body.data).toMatchObject({
      recordNumber: 'CI-HT-001',
      status: 'ACTIVE',
    });
    expect(verified.body.data).not.toHaveProperty('internalNote');
    expect(verified.body.data).not.toHaveProperty('amountDisplay');
    expect(verified.body.data).not.toHaveProperty('id');

    await agent
      .patch(`/api/v1/admin/records/${created.body.data.id}`)
      .set('x-csrf-token', csrf)
      .send({ revision: 1, title: '不应覆盖' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('DOCUMENT_CONFLICT'));

    const qrCode = await agent
      .get(`/api/v1/admin/records/${created.body.data.id}/qrcode`)
      .expect('content-type', 'image/png')
      .expect(200);
    const png = PNG.sync.read(qrCode.body as Buffer);
    const decodeQr = jsQR as unknown as (
      data: Uint8ClampedArray,
      width: number,
      height: number,
    ) => { data: string } | null;
    const decoded = decodeQr(
      new Uint8ClampedArray(png.data),
      png.width,
      png.height,
    );
    expect(decoded?.data).toBe(
      `http://localhost:3000/v/${created.body.data.publicToken}`,
    );

    const versions = await agent
      .get(`/api/v1/admin/records/${created.body.data.id}/versions`)
      .expect(200);
    expect(versions.body.data).toHaveLength(2);
    expect(published.body.data.revision).toBe(2);

    await agent
      .post('/api/v1/admin/users')
      .set('x-csrf-token', csrf)
      .send({
        username: 'viewer',
        displayName: '只读用户',
        password: 'Viewer-password-2026!',
        role: 'VIEWER',
      })
      .expect(201);
    const viewer = request.agent(app);
    const viewerLogin = await viewer
      .post('/api/v1/auth/login')
      .send({ username: 'viewer', password: 'Viewer-password-2026!' })
      .expect(200);
    await viewer.get('/api/v1/admin/records').expect(200);
    await viewer
      .post('/api/v1/admin/records')
      .set('x-csrf-token', viewerLogin.body.csrfToken as string)
      .send({})
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('PERMISSION_DENIED'));

    const audit = await agent
      .get('/api/v1/admin/audit-logs')
      .query({
        actor: '集成测试管理员',
        action: 'RECORD_CREATED',
        dateFrom: '2000-01-01',
        dateTo: '2100-12-31',
      })
      .expect(200);
    expect(audit.body.pagination.total).toBe(1);
    expect(audit.body.data[0]).toMatchObject({
      action: 'RECORD_CREATED',
      actorDisplayName: '集成测试管理员',
    });

    await agent
      .patch(`/api/v1/admin/users/${login.body.data.id}`)
      .set('x-csrf-token', csrf)
      .send({ role: 'EDITOR' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('LAST_SUPER_ADMIN'));
  }, 30_000);
});
