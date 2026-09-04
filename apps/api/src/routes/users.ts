import { Router } from 'express';
import { argon2id, hash } from 'argon2';
import type { DataSource } from 'typeorm';
import { z } from 'zod';

import { createUserSchema, USER_ROLES, USER_STATUSES } from '@haitong/shared';

import type { AppConfig } from '../config/env.js';
import { returningRows } from '../db/query-result.js';
import type { UserRow } from '../db/types.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/app-error.js';
import {
  getAuth,
  requireAuth,
  requireCsrf,
  requirePermission,
} from '../middleware/auth.js';

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, '至少提供一个修改字段');

const resetPasswordSchema = z.object({
  password: z.string().min(12).max(128),
});
const idSchema = z.uuid();

function toUserDto(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function createUsersRouter(dataSource: DataSource, config: AppConfig) {
  const router = Router();
  router.use(requireAuth(dataSource, config));
  router.use(requirePermission('users:manage'));

  router.get('/', async (_request, response, next) => {
    try {
      const users = (await dataSource.query(
        'SELECT * FROM users ORDER BY created_at ASC',
      )) as UserRow[];
      response.json({
        data: users.map(toUserDto),
        requestId: response.locals.requestId as string,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireCsrf(config), async (request, response, next) => {
    try {
      const input = createUserSchema.parse(request.body);
      const actor = getAuth(response);
      const passwordHash = await hash(input.password, { type: argon2id });
      let created: UserRow | undefined;
      await dataSource.transaction(async (manager) => {
        try {
          const rows = (await manager.query(
            `INSERT INTO users (username, display_name, password_hash, role)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [input.username, input.displayName, passwordHash, input.role],
          )) as UserRow[];
          created = rows[0];
        } catch (error) {
          if (
            typeof error === 'object' &&
            error &&
            'code' in error &&
            error.code === '23505'
          ) {
            throw new AppError(409, 'USERNAME_EXISTS', '用户名已存在');
          }
          throw error;
        }
        if (!created)
          throw new AppError(500, 'USER_CREATE_FAILED', '用户创建失败');
        await writeAudit(manager, config, {
          actor,
          action: 'USER_CREATED',
          resourceType: 'USER',
          resourceId: created.id,
          summary: { username: created.username, role: created.role },
          requestId: String(response.locals.requestId),
          ip: request.ip,
          userAgent: request.get('user-agent'),
        });
      });
      response.status(201).json({
        data: toUserDto(created as UserRow),
        requestId: response.locals.requestId as string,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', requireCsrf(config), async (request, response, next) => {
    try {
      const input = updateUserSchema.parse(request.body);
      const actor = getAuth(response);
      const userId = idSchema.parse(request.params.id);
      if (userId === actor.id && input.status === 'DISABLED') {
        throw new AppError(400, 'CANNOT_DISABLE_SELF', '不能停用当前登录账户');
      }
      const values: unknown[] = [];
      const assignments: string[] = [];
      for (const [column, value] of [
        ['display_name', input.displayName],
        ['role', input.role],
        ['status', input.status],
      ] as const) {
        if (value !== undefined) {
          values.push(value);
          assignments.push(`${column} = $${values.length}`);
        }
      }
      values.push(userId);
      let updated: UserRow | undefined;
      await dataSource.transaction(async (manager) => {
        const currentRows = (await manager.query(
          'SELECT * FROM users WHERE id = $1 FOR UPDATE',
          [userId],
        )) as UserRow[];
        const current = currentRows[0];
        if (!current) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
        const removesSuperAdmin =
          current.role === 'SUPER_ADMIN' &&
          ((input.role !== undefined && input.role !== 'SUPER_ADMIN') ||
            input.status === 'DISABLED');
        if (removesSuperAdmin) {
          const counts = (await manager.query(
            `SELECT count(*)::int AS count FROM users
              WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`,
          )) as Array<{ count: number }>;
          if ((counts[0]?.count ?? 0) <= 1) {
            throw new AppError(
              409,
              'LAST_SUPER_ADMIN',
              '必须至少保留一个启用的超级管理员',
            );
          }
        }
        const rows = returningRows<UserRow>(
          await manager.query(
            `UPDATE users SET ${assignments.join(', ')}, updated_at = now()
            WHERE id = $${values.length} RETURNING *`,
            values,
          ),
        );
        updated = rows[0];
        if (!updated) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
        if (input.status === 'DISABLED') {
          await manager.query(
            'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
            [updated.id],
          );
        }
        await writeAudit(manager, config, {
          actor,
          action: 'USER_UPDATED',
          resourceType: 'USER',
          resourceId: updated.id,
          summary: input,
          requestId: String(response.locals.requestId),
          ip: request.ip,
          userAgent: request.get('user-agent'),
        });
      });
      response.json({
        data: toUserDto(updated as UserRow),
        requestId: response.locals.requestId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:id/reset-password',
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const { password } = resetPasswordSchema.parse(request.body);
        const actor = getAuth(response);
        const userId = idSchema.parse(request.params.id);
        const passwordHash = await hash(password, { type: argon2id });
        await dataSource.transaction(async (manager) => {
          const rows = returningRows<{ id: string }>(
            await manager.query(
              `UPDATE users SET password_hash = $1, password_changed_at = now(),
               failed_login_count = 0, locked_until = NULL, updated_at = now()
             WHERE id = $2 RETURNING id`,
              [passwordHash, userId],
            ),
          );
          if (!rows[0]) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
          await manager.query(
            'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
            [userId],
          );
          await writeAudit(manager, config, {
            actor,
            action: 'USER_PASSWORD_RESET',
            resourceType: 'USER',
            resourceId: userId,
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
