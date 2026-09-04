import { Router } from 'express';
import QRCode from 'qrcode';
import type { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';

import {
  canTransitionRecordStatus,
  createRecordSchema,
  RECORD_STATUSES,
  RECORD_TYPES,
  statusChangeSchema,
  updateRecordSchema,
  type CreateRecordInput,
} from '@haitong/shared';

import type { AppConfig } from '../config/env.js';
import { returningRows } from '../db/query-result.js';
import type { VerificationRecordRow } from '../db/types.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/app-error.js';
import {
  adminRecordDto,
  publicRecordDto,
  recordInsertValues,
  rowToInput,
} from '../lib/record.js';
import { createOpaqueToken } from '../lib/security.js';
import {
  getAuth,
  requireAuth,
  requireCsrf,
  requirePermission,
} from '../middleware/auth.js';

const idSchema = z.uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(RECORD_TYPES).optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  query: z.string().trim().max(200).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'recordNumber', 'businessDate'])
    .default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const INSERT_SQL = `
  INSERT INTO verification_records (
    public_token, record_type, record_number, title, issuer_name,
    document_version, business_date, file_sha256, public_remark, internal_note,
    tenderer_name, agency_name, project_type, publish_date,
    counterparty_name, amount_display, signed_date, valid_from, valid_until,
    created_by, updated_by
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20
  ) ON CONFLICT (public_token) DO NOTHING RETURNING *`;

const UPDATE_SQL = `
  UPDATE verification_records SET
    record_number = $1, title = $2, issuer_name = $3,
    document_version = $4, business_date = $5, file_sha256 = $6,
    public_remark = $7, internal_note = $8, tenderer_name = $9,
    agency_name = $10, project_type = $11, publish_date = $12,
    counterparty_name = $13, amount_display = $14, signed_date = $15,
    valid_from = $16, valid_until = $17, revision = revision + 1,
    updated_by = $18, updated_at = now()
  WHERE id = $19 AND revision = $20 AND deleted_at IS NULL
  RETURNING *`;

async function getLockedRecord(manager: EntityManager, id: string) {
  const rows = (await manager.query(
    'SELECT * FROM verification_records WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id],
  )) as VerificationRecordRow[];
  const row = rows[0];
  if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', '登记记录不存在');
  return row;
}

async function appendVersion(
  manager: EntityManager,
  record: VerificationRecordRow,
  actorId: string,
  reason: string | null,
  config: AppConfig,
) {
  const versions = (await manager.query(
    'SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM record_versions WHERE record_id = $1',
    [record.id],
  )) as Array<{ version_no: string }>;
  await manager.query(
    `INSERT INTO record_versions
      (record_id, version_no, snapshot, change_reason, changed_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [
      record.id,
      Number(versions[0]?.version_no ?? 1),
      JSON.stringify(publicRecordDto(record, config.PUBLISH_CONTRACT_AMOUNT)),
      reason,
      actorId,
    ],
  );
}

function mergeRecordInput(
  current: VerificationRecordRow,
  update: z.infer<typeof updateRecordSchema>,
): CreateRecordInput {
  const original = rowToInput(current);
  const common = {
    recordNumber: update.recordNumber ?? original.recordNumber,
    title: update.title ?? original.title,
    issuerName: update.issuerName ?? original.issuerName,
    documentVersion: update.documentVersion ?? original.documentVersion,
    businessDate: update.businessDate ?? original.businessDate,
    fileSha256:
      update.fileSha256 === undefined
        ? original.fileSha256
        : (update.fileSha256 ?? undefined),
    publicRemark:
      update.publicRemark === undefined
        ? original.publicRemark
        : (update.publicRemark ?? undefined),
    internalNote:
      update.internalNote === undefined
        ? original.internalNote
        : (update.internalNote ?? undefined),
  };
  if (original.recordType === 'TENDER_DOCUMENT') {
    return createRecordSchema.parse({
      recordType: 'TENDER_DOCUMENT',
      ...common,
      tendererName: update.tendererName ?? original.tendererName,
      agencyName:
        update.agencyName === undefined
          ? original.agencyName
          : (update.agencyName ?? undefined),
      projectType: update.projectType ?? original.projectType,
      publishDate: update.publishDate ?? original.publishDate,
    });
  }
  return createRecordSchema.parse({
    recordType: 'CONTRACT',
    ...common,
    counterpartyName: update.counterpartyName ?? original.counterpartyName,
    amountDisplay:
      update.amountDisplay === undefined
        ? original.amountDisplay
        : (update.amountDisplay ?? undefined),
    signedDate: update.signedDate ?? original.signedDate,
    validFrom:
      update.validFrom === undefined
        ? original.validFrom
        : (update.validFrom ?? undefined),
    validUntil:
      update.validUntil === undefined
        ? original.validUntil
        : (update.validUntil ?? undefined),
  });
}

export function createRecordsRouter(dataSource: DataSource, config: AppConfig) {
  const router = Router();
  router.use(requireAuth(dataSource, config));
  router.use(requirePermission('records:read'));

  router.get('/', async (request, response, next) => {
    try {
      const filter = listSchema.parse(request.query);
      const conditions = ['deleted_at IS NULL'];
      const values: unknown[] = [];
      const add = (condition: string, value: unknown) => {
        values.push(value);
        conditions.push(condition.replace('?', `$${values.length}`));
      };
      if (filter.type) add('record_type = ?', filter.type);
      if (filter.status) add('status = ?', filter.status);
      if (filter.query) {
        values.push(`%${filter.query}%`, `%${filter.query}%`);
        conditions.push(
          `(record_number ILIKE $${values.length - 1} OR title ILIKE $${values.length})`,
        );
      }
      if (filter.dateFrom) add('business_date >= ?', filter.dateFrom);
      if (filter.dateTo) add('business_date <= ?', filter.dateTo);
      const sortColumns = {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        recordNumber: 'record_number',
        businessDate: 'business_date',
      } as const;
      const where = conditions.join(' AND ');
      const counts = (await dataSource.query(
        `SELECT count(*)::int AS total FROM verification_records WHERE ${where}`,
        values,
      )) as Array<{ total: number }>;
      const rows = (await dataSource.query(
        `SELECT * FROM verification_records WHERE ${where}
          ORDER BY ${sortColumns[filter.sortBy]} ${filter.sortOrder.toUpperCase()}, id ASC
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, filter.pageSize, (filter.page - 1) * filter.pageSize],
      )) as VerificationRecordRow[];
      response.json({
        data: rows.map((row) => adminRecordDto(row, config.PUBLIC_BASE_URL)),
        pagination: {
          page: filter.page,
          pageSize: filter.pageSize,
          total: counts[0]?.total ?? 0,
        },
        requestId: response.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/',
    requirePermission('records:write'),
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const input = createRecordSchema.parse(request.body);
        const actor = getAuth(response);
        let created: VerificationRecordRow | undefined;
        await dataSource.transaction(async (manager) => {
          for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
            const rows = (await manager.query(INSERT_SQL, [
              createOpaqueToken(),
              ...recordInsertValues(input),
              actor.id,
            ])) as VerificationRecordRow[];
            created = rows[0];
          }
          if (!created)
            throw new AppError(
              500,
              'TOKEN_GENERATION_FAILED',
              '公开令牌生成失败',
            );
          await appendVersion(manager, created, actor.id, '创建记录', config);
          await writeAudit(manager, config, {
            actor,
            action: 'RECORD_CREATED',
            resourceType: 'VERIFICATION_RECORD',
            resourceId: created.id,
            summary: {
              recordType: created.record_type,
              recordNumber: created.record_number,
            },
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.status(201).json({
          data: adminRecordDto(
            created as VerificationRecordRow,
            config.PUBLIC_BASE_URL,
          ),
          requestId: response.locals.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/:id/versions', async (request, response, next) => {
    try {
      const id = idSchema.parse(request.params.id);
      const rows = (await dataSource.query(
        `SELECT version_no AS "versionNo", snapshot, change_reason AS "changeReason",
                changed_by AS "changedBy", created_at AS "createdAt"
           FROM record_versions WHERE record_id = $1 ORDER BY version_no DESC`,
        [id],
      )) as unknown[];
      response.json({ data: rows, requestId: response.locals.requestId });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/qrcode', async (request, response, next) => {
    try {
      const id = idSchema.parse(request.params.id);
      const rows = (await dataSource.query(
        'SELECT * FROM verification_records WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [id],
      )) as VerificationRecordRow[];
      const row = rows[0];
      if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', '登记记录不存在');
      const url = `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/v/${row.public_token}`;
      const image = await QRCode.toBuffer(url, {
        type: 'png',
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      response.setHeader('content-type', 'image/png');
      response.setHeader(
        'content-disposition',
        `inline; filename="${row.record_number.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}.png"`,
      );
      response.setHeader('cache-control', 'private, max-age=300');
      response.send(image);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      const id = idSchema.parse(request.params.id);
      const rows = (await dataSource.query(
        'SELECT * FROM verification_records WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [id],
      )) as VerificationRecordRow[];
      const row = rows[0];
      if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', '登记记录不存在');
      response.json({
        data: adminRecordDto(row, config.PUBLIC_BASE_URL),
        requestId: response.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/:id',
    requirePermission('records:write'),
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const id = idSchema.parse(request.params.id);
        const update = updateRecordSchema.parse(request.body);
        const actor = getAuth(response);
        let updated: VerificationRecordRow | undefined;
        await dataSource.transaction(async (manager) => {
          const current = await getLockedRecord(manager, id);
          if (current.revision !== update.revision) {
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          }
          const merged = mergeRecordInput(current, update);
          if (JSON.stringify(rowToInput(current)) === JSON.stringify(merged)) {
            updated = current;
            return;
          }
          const beforePublic = publicRecordDto(
            current,
            config.PUBLISH_CONTRACT_AMOUNT,
          );
          const rows = returningRows<VerificationRecordRow>(
            await manager.query(UPDATE_SQL, [
              ...recordInsertValues(merged).slice(1),
              actor.id,
              id,
              update.revision,
            ]),
          );
          updated = rows[0];
          if (!updated)
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          const afterPublic = publicRecordDto(
            updated,
            config.PUBLISH_CONTRACT_AMOUNT,
          );
          const beforeComparable = { ...beforePublic, updatedAt: null };
          const afterComparable = { ...afterPublic, updatedAt: null };
          if (
            JSON.stringify(beforeComparable) !== JSON.stringify(afterComparable)
          ) {
            await appendVersion(manager, updated, actor.id, null, config);
          }
          await writeAudit(manager, config, {
            actor,
            action: 'RECORD_UPDATED',
            resourceType: 'VERIFICATION_RECORD',
            resourceId: id,
            summary: { revision: updated.revision },
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.json({
          data: adminRecordDto(
            updated as VerificationRecordRow,
            config.PUBLIC_BASE_URL,
          ),
          requestId: response.locals.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:id/status',
    requirePermission('records:status'),
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const id = idSchema.parse(request.params.id);
        const input = statusChangeSchema.parse(request.body);
        const actor = getAuth(response);
        let updated: VerificationRecordRow | undefined;
        await dataSource.transaction(async (manager) => {
          const current = await getLockedRecord(manager, id);
          if (current.revision !== input.revision) {
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          }
          if (!canTransitionRecordStatus(current.status, input.status)) {
            throw new AppError(
              409,
              'INVALID_STATUS_TRANSITION',
              '不允许执行此状态转换',
            );
          }
          const rows = returningRows<VerificationRecordRow>(
            await manager.query(
              `UPDATE verification_records SET status = $1, revision = revision + 1,
               updated_by = $2, updated_at = now()
             WHERE id = $3 AND revision = $4 RETURNING *`,
              [input.status, actor.id, id, input.revision],
            ),
          );
          updated = rows[0];
          if (!updated)
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          await appendVersion(
            manager,
            updated,
            actor.id,
            input.reason ?? null,
            config,
          );
          await writeAudit(manager, config, {
            actor,
            action: 'RECORD_STATUS_CHANGED',
            resourceType: 'VERIFICATION_RECORD',
            resourceId: id,
            summary: {
              from: current.status,
              to: input.status,
              reason: input.reason,
            },
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.json({
          data: adminRecordDto(
            updated as VerificationRecordRow,
            config.PUBLIC_BASE_URL,
          ),
          requestId: response.locals.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:id/rotate-token',
    requirePermission('records:rotate-token'),
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const id = idSchema.parse(request.params.id);
        const { revision } = z
          .object({ revision: z.number().int().positive() })
          .parse(request.body);
        const actor = getAuth(response);
        let updated: VerificationRecordRow | undefined;
        await dataSource.transaction(async (manager) => {
          const current = await getLockedRecord(manager, id);
          if (current.revision !== revision)
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          const rows = returningRows<VerificationRecordRow>(
            await manager.query(
              `UPDATE verification_records SET public_token = $1, revision = revision + 1,
               updated_by = $2, updated_at = now() WHERE id = $3 AND revision = $4 RETURNING *`,
              [createOpaqueToken(), actor.id, id, revision],
            ),
          );
          updated = rows[0];
          if (!updated)
            throw new AppError(
              409,
              'DOCUMENT_CONFLICT',
              '记录已被其他用户修改，请刷新后重试',
            );
          await writeAudit(manager, config, {
            actor,
            action: 'RECORD_TOKEN_ROTATED',
            resourceType: 'VERIFICATION_RECORD',
            resourceId: id,
            summary: { revision: updated.revision },
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.json({
          data: adminRecordDto(
            updated as VerificationRecordRow,
            config.PUBLIC_BASE_URL,
          ),
          requestId: response.locals.requestId,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
