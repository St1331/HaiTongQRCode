import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const filterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(100).optional(),
  resourceType: z.string().trim().max(100).optional(),
  actor: z.string().trim().max(100).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

export function createAuditRouter(dataSource: DataSource, config: AppConfig) {
  const router = Router();
  router.use(requireAuth(dataSource, config));
  router.use(requirePermission('audit:read'));
  router.get('/', async (request, response, next) => {
    try {
      const filter = filterSchema.parse(request.query);
      const values: unknown[] = [];
      const conditions: string[] = [];
      if (filter.action) {
        values.push(filter.action);
        conditions.push(`a.action = $${values.length}`);
      }
      if (filter.resourceType) {
        values.push(filter.resourceType);
        conditions.push(`a.resource_type = $${values.length}`);
      }
      if (filter.actor) {
        values.push(`%${filter.actor}%`, `%${filter.actor}%`);
        conditions.push(
          `(u.username ILIKE $${values.length - 1} OR u.display_name ILIKE $${values.length})`,
        );
      }
      if (filter.dateFrom) {
        values.push(filter.dateFrom);
        conditions.push(`a.created_at >= $${values.length}::date`);
      }
      if (filter.dateTo) {
        values.push(filter.dateTo);
        conditions.push(
          `a.created_at < ($${values.length}::date + interval '1 day')`,
        );
      }
      const where = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';
      const counts = (await dataSource.query(
        `SELECT count(*)::int AS total
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ${where}`,
        values,
      )) as Array<{ total: number }>;
      const rows = (await dataSource.query(
        `SELECT a.id, a.action, a.resource_type AS "resourceType",
                a.resource_id AS "resourceId", a.summary,
                a.request_id AS "requestId", a.user_agent AS "userAgent",
                a.created_at AS "createdAt", u.display_name AS "actorDisplayName"
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ${where}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, filter.pageSize, (filter.page - 1) * filter.pageSize],
      )) as unknown[];
      response.json({
        data: rows,
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
  return router;
}
