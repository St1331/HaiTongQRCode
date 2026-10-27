import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
      throw new Error(
        'Integration tests require a dedicated database ending in _test',
      );
    }
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
  }, 30_000);

  beforeEach(async () => {
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

  const contract = {
    recordType: 'CONTRACT',
    recordNumber: 'ACCEPTANCE-001',
    title: '验收合同',
    issuerName: '测试签发方',
    documentVersion: 'V1',
    businessDate: '2026-09-07',
    counterpartyName: '测试合作方',
    signedDate: '2026-09-07',
    internalNote: '仅内部可见',
    amountDisplay: '100 万元',
  };

  async function login(
    app: ReturnType<typeof createApp>,
    username = 'admin',
    password = 'Integration-password-2026!',
  ) {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(200);
    return {
      agent,
      csrf: response.body.csrfToken as string,
      id: response.body.data.id as string,
    };
  }

  it('preserves the last active administrator under concurrent demotions', async () => {
    const app = createApp({ config, dataSource });
    const first = await login(app);
    await first.agent
      .post('/api/v1/admin/users')
      .set('x-csrf-token', first.csrf)
      .send({
        username: 'second',
        displayName: '另一管理员',
        role: 'SUPER_ADMIN',
        password: 'Integration-password-2026!',
      })
      .expect(201);
    const second = await login(app, 'second');
    const responses = await Promise.all(
      [first, second].map((user) =>
        user.agent
          .patch(`/api/v1/admin/users/${user.id}`)
          .set('x-csrf-token', user.csrf)
          .send({ role: 'EDITOR' }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body.error.code).toBe(
      'LAST_SUPER_ADMIN',
    );
    const rows = (await dataSource.query(
      "SELECT count(*)::int AS count FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'",
    )) as Array<{ count: number }>;
    expect(rows[0]?.count).toBe(1);
  });

  it.each(['VIEWER', 'EDITOR', 'SUPER_ADMIN'] as const)(
    'enforces the %s permission matrix',
    async (role) => {
      const app = createApp({ config, dataSource });
      const admin = await login(app);
      await admin.agent
        .post('/api/v1/admin/users')
        .set('x-csrf-token', admin.csrf)
        .send({
          username: 'member',
          displayName: '权限验收',
          role,
          password: 'Integration-password-2026!',
        })
        .expect(201);
      const member = await login(app, 'member');
      const record = await admin.agent
        .post('/api/v1/admin/records')
        .set('x-csrf-token', admin.csrf)
        .send(contract)
        .expect(201);
      const id = record.body.data.id as string;
      for (const path of [
        '/admin/records',
        `/admin/records/${id}`,
        `/admin/records/${id}/versions`,
        `/admin/records/${id}/qrcode`,
      ]) {
        await member.agent.get(`/api/v1${path}`).expect(200);
      }
      for (const path of ['/admin/users', '/admin/audit-logs']) {
        await member.agent
          .get(`/api/v1${path}`)
          .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      }
      await member.agent
        .post('/api/v1/admin/records')
        .set('x-csrf-token', member.csrf)
        .send(contract)
        .expect(role === 'VIEWER' ? 403 : 201);
      const edited = await member.agent
        .patch(`/api/v1/admin/records/${id}`)
        .set('x-csrf-token', member.csrf)
        .send({ revision: 1, title: '权限修改验证' })
        .expect(role === 'VIEWER' ? 403 : 200);
      const revision =
        role === 'VIEWER' ? 1 : (edited.body.data.revision as number);
      const published = await member.agent
        .post(`/api/v1/admin/records/${id}/status`)
        .set('x-csrf-token', member.csrf)
        .send({ revision, status: 'ACTIVE' })
        .expect(role === 'VIEWER' ? 403 : 200);
      await member.agent
        .post(`/api/v1/admin/records/${id}/rotate-token`)
        .set('x-csrf-token', member.csrf)
        .send({ revision: published.body.data?.revision ?? 1 })
        .expect(role === 'SUPER_ADMIN' ? 200 : 403);
      await member.agent
        .post('/api/v1/admin/users')
        .set('x-csrf-token', member.csrf)
        .send({
          username: 'created',
          displayName: '新用户',
          role: 'VIEWER',
          password: 'Integration-password-2026!',
        })
        .expect(role === 'SUPER_ADMIN' ? 201 : 403);
    },
  );

  it('keeps public 404 responses identical and invalidates a rotated token immediately', async () => {
    const app = createApp({ config, dataSource });
    const admin = await login(app);
    const created = await admin.agent
      .post('/api/v1/admin/records')
      .set('x-csrf-token', admin.csrf)
      .send(contract)
      .expect(201);
    const { id, publicToken } = created.body.data as {
      id: string;
      publicToken: string;
    };
    const absent = await request(app)
      .get('/api/v1/public/records/not-a-token')
      .expect(404);
    for (const token of [publicToken, 'x'.repeat(32)]) {
      const response = await request(app)
        .get(`/api/v1/public/records/${token}`)
        .expect(404);
      expect(response.body.error).toEqual(absent.body.error);
    }
    await admin.agent
      .post(`/api/v1/admin/records/${id}/status`)
      .set('x-csrf-token', admin.csrf)
      .send({ revision: 1, status: 'ACTIVE' })
      .expect(200);
    const visible = await request(app)
      .get(`/api/v1/public/records/${publicToken}`)
      .expect(200);
    for (const key of [
      'id',
      'publicToken',
      'internalNote',
      'createdBy',
      'updatedBy',
      'revision',
      'amountDisplay',
    ])
      expect(visible.body.data).not.toHaveProperty(key);
    const amountApp = createApp({
      config: { ...config, PUBLISH_CONTRACT_AMOUNT: true },
      dataSource,
    });
    const amount = await request(amountApp)
      .get(`/api/v1/public/records/${publicToken}`)
      .expect(200);
    expect(amount.body.data.amountDisplay).toBe(contract.amountDisplay);
    const rotated = await admin.agent
      .post(`/api/v1/admin/records/${id}/rotate-token`)
      .set('x-csrf-token', admin.csrf)
      .send({ revision: 2 })
      .expect(200);
    expect(rotated.body.data.publicToken).not.toBe(publicToken);
    await request(app).get(`/api/v1/public/records/${publicToken}`).expect(404);
    await request(app)
      .get(`/api/v1/public/records/${rotated.body.data.publicToken}`)
      .expect(200);
    await dataSource.query(
      'UPDATE verification_records SET deleted_at = now() WHERE id = $1',
      [id],
    );
    const deleted = await request(app)
      .get(`/api/v1/public/records/${rotated.body.data.publicToken}`)
      .expect(404);
    expect(deleted.body.error).toEqual(absent.body.error);
  });

  it.each(['disable', 'reset', 'change'] as const)(
    'revokes existing sessions on %s',
    async (action) => {
      const app = createApp({ config, dataSource });
      const admin = await login(app);
      await admin.agent
        .post('/api/v1/admin/users')
        .set('x-csrf-token', admin.csrf)
        .send({
          username: 'member',
          displayName: '会话验证',
          role: 'EDITOR',
          password: 'Integration-password-2026!',
        })
        .expect(201);
      const member = await login(app, 'member');
      const otherSession = await login(app, 'member');
      if (action === 'disable')
        await admin.agent
          .patch(`/api/v1/admin/users/${member.id}`)
          .set('x-csrf-token', admin.csrf)
          .send({ status: 'DISABLED' })
          .expect(200);
      if (action === 'reset')
        await admin.agent
          .post(`/api/v1/admin/users/${member.id}/reset-password`)
          .set('x-csrf-token', admin.csrf)
          .send({ password: 'New-integration-password!' })
          .expect(204);
      if (action === 'change')
        await member.agent
          .post('/api/v1/auth/change-password')
          .set('x-csrf-token', member.csrf)
          .send({
            currentPassword: 'Integration-password-2026!',
            newPassword: 'New-integration-password!',
          })
          .expect(204);
      await otherSession.agent.get('/api/v1/auth/me').expect(401);
      await member.agent.get('/api/v1/admin/records').expect(401);
    },
  );

  it('rolls back record and snapshot when the audit insert fails', async () => {
    const app = createApp({ config, dataSource });
    const admin = await login(app);
    await dataSource.query(`CREATE FUNCTION reject_test_record_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'RECORD_CREATED' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
    await dataSource.query(
      'CREATE TRIGGER reject_test_record_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_record_audit()',
    );
    try {
      await admin.agent
        .post('/api/v1/admin/records')
        .set('x-csrf-token', admin.csrf)
        .send(contract)
        .expect(500);
      for (const table of ['verification_records', 'record_versions']) {
        const rows = (await dataSource.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        )) as Array<{ count: number }>;
        expect(rows[0]?.count).toBe(0);
      }
      const audit = (await dataSource.query(
        "SELECT count(*)::int AS count FROM audit_logs WHERE action = 'RECORD_CREATED'",
      )) as Array<{ count: number }>;
      expect(audit[0]?.count).toBe(0);
    } finally {
      await dataSource.query(
        'DROP TRIGGER reject_test_record_audit ON audit_logs',
      );
      await dataSource.query('DROP FUNCTION reject_test_record_audit()');
    }
  });

  it.each(['edit', 'status'] as const)(
    'rolls back %s and its snapshot when audit fails',
    async (action) => {
      const app = createApp({ config, dataSource });
      const admin = await login(app);
      const created = await admin.agent
        .post('/api/v1/admin/records')
        .set('x-csrf-token', admin.csrf)
        .send(contract)
        .expect(201);
      const id = created.body.data.id as string;
      await dataSource.query(`CREATE FUNCTION reject_test_mutation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('RECORD_UPDATED', 'RECORD_STATUS_CHANGED') THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
      await dataSource.query(
        'CREATE TRIGGER reject_test_mutation_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_mutation_audit()',
      );
      try {
        if (action === 'edit')
          await admin.agent
            .patch(`/api/v1/admin/records/${id}`)
            .set('x-csrf-token', admin.csrf)
            .send({ revision: 1, title: '不能保存' })
            .expect(500);
        else
          await admin.agent
            .post(`/api/v1/admin/records/${id}/status`)
            .set('x-csrf-token', admin.csrf)
            .send({ revision: 1, status: 'ACTIVE' })
            .expect(500);
        const record = await admin.agent
          .get(`/api/v1/admin/records/${id}`)
          .expect(200);
        expect(record.body.data).toMatchObject({
          title: contract.title,
          status: 'DRAFT',
          revision: 1,
        });
        const versions = await admin.agent
          .get(`/api/v1/admin/records/${id}/versions`)
          .expect(200);
        expect(versions.body.data).toHaveLength(1);
        const audits = (await dataSource.query(
          "SELECT count(*)::int AS count FROM audit_logs WHERE action IN ('RECORD_UPDATED', 'RECORD_STATUS_CHANGED')",
        )) as Array<{ count: number }>;
        expect(audits[0]?.count).toBe(0);
      } finally {
        await dataSource.query(
          'DROP TRIGGER reject_test_mutation_audit ON audit_logs',
        );
        await dataSource.query('DROP FUNCTION reject_test_mutation_audit()');
      }
    },
  );

  it('locks an account after concurrent invalid passwords and denies replayed sessions', async () => {
    const app = createApp({ config, dataSource });
    const admin = await login(app);
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'admin', password: 'Incorrect-password!' }),
      ),
    );
    expect(
      attempts.every((response) => [401, 423].includes(response.status)),
    ).toBe(true);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Integration-password-2026!' })
      .expect(423);
    await admin.agent
      .post('/api/v1/auth/logout')
      .set('x-csrf-token', admin.csrf)
      .expect(204);
    await admin.agent.get('/api/v1/auth/me').expect(401);
  });

  it('prevents database updates and deletes of audit records', async () => {
    await login(createApp({ config, dataSource }));
    await expect(
      dataSource.query("UPDATE audit_logs SET action = 'REWRITTEN'"),
    ).rejects.toMatchObject({ code: '23000' });
    await expect(
      dataSource.query('DELETE FROM audit_logs'),
    ).rejects.toMatchObject({ code: '23000' });
    const rows = (await dataSource.query(
      'SELECT count(*)::int AS count FROM audit_logs',
    )) as Array<{ count: number }>;
    expect(rows[0]?.count).toBe(1);
  });

  it('rejects invalid constraints, preserves indexes, and migrates down then up', async () => {
    await expect(
      dataSource.query(
        "UPDATE users SET role = 'OWNER' WHERE username = 'admin'",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      dataSource.query(
        'INSERT INTO users (username, display_name, password_hash, role) SELECT username, display_name, password_hash, role FROM users LIMIT 1',
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const indexes = (await dataSource.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    )) as Array<{ indexname: string }>;
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'verification_records_public_token_unique',
        'record_versions_unique',
        'users_username_unique',
      ]),
    );
    await dataSource.undoLastMigration({ transaction: 'all' });
    const migrations = await dataSource.runMigrations({ transaction: 'all' });
    expect(migrations).toHaveLength(1);
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('reverts the entire initial schema and reapplies every migration', async () => {
    const applied = (await dataSource.query(
      'SELECT count(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    expect(applied[0]?.count).toBe(4);
    for (let index = 0; index < 4; index++)
      await dataSource.undoLastMigration({ transaction: 'all' });
    const tables = (await dataSource.query(
      "SELECT to_regclass('public.users') AS users",
    )) as Array<{ users: string | null }>;
    expect(tables[0]?.users).toBeNull();
    expect(await dataSource.runMigrations({ transaction: 'all' })).toHaveLength(
      4,
    );
    expect(await dataSource.showMigrations()).toBe(false);
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
