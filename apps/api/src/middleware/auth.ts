import type { RequestHandler, Response } from 'express';
import type { DataSource } from 'typeorm';

import { hasPermission, type Permission } from '@haitong/shared';

import type { AppConfig } from '../config/env.js';
import type { AuthenticatedUser } from '../db/types.js';
import { AppError } from '../lib/app-error.js';
import { addMinutes, hmacToken } from '../lib/security.js';

interface SessionRow {
  session_id: string;
  csrf_hash: string;
  absolute_expires_at: Date;
  id: string;
  username: string;
  display_name: string;
  role: AuthenticatedUser['role'];
}

interface AuthLocals extends Record<string, unknown> {
  auth: AuthenticatedUser;
  sessionId: string;
}

export function getAuth(response: Response): AuthenticatedUser {
  const auth = (response.locals as AuthLocals).auth;
  if (!auth) throw new AppError(401, 'AUTH_REQUIRED', '请先登录');
  return auth;
}

export function requireAuth(
  dataSource: DataSource,
  config: AppConfig,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const token = request.cookies?.ht_session as string | undefined;
      if (!token) throw new AppError(401, 'AUTH_REQUIRED', '请先登录');
      const csrfToken = request.cookies?.ht_csrf as string | undefined;
      const tokenHash = hmacToken(config.SESSION_HMAC_SECRET, token);
      const rows = (await dataSource.query(
        `SELECT s.id AS session_id, s.csrf_hash, s.absolute_expires_at,
                u.id, u.username, u.display_name, u.role
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.revoked_at IS NULL
            AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
            AND u.status = 'ACTIVE'
          LIMIT 1`,
        [tokenHash],
      )) as SessionRow[];
      const row = rows[0];
      if (!row) throw new AppError(401, 'SESSION_INVALID', '登录状态已失效');
      if (
        !csrfToken ||
        hmacToken(config.SESSION_HMAC_SECRET, csrfToken) !== row.csrf_hash
      ) {
        throw new AppError(401, 'SESSION_INVALID', '登录状态已失效');
      }

      const idleExpiry = addMinutes(new Date(), config.SESSION_IDLE_MINUTES);
      const boundedExpiry = new Date(
        Math.min(
          idleExpiry.getTime(),
          new Date(row.absolute_expires_at).getTime(),
        ),
      );
      await dataSource.query(
        'UPDATE auth_sessions SET idle_expires_at = $1, last_seen_at = now() WHERE id = $2',
        [boundedExpiry, row.session_id],
      );

      (response.locals as AuthLocals).auth = {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
      };
      (response.locals as AuthLocals).sessionId = row.session_id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (_request, response, next) => {
    try {
      const auth = getAuth(response);
      if (!hasPermission(auth.role, permission)) {
        throw new AppError(403, 'PERMISSION_DENIED', '没有执行此操作的权限');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCsrf(config: AppConfig): RequestHandler {
  return async (request, response, next) => {
    try {
      const origin = request.headers.origin;
      if (origin && origin !== new URL(config.PUBLIC_BASE_URL).origin) {
        throw new AppError(403, 'ORIGIN_REJECTED', '请求来源无效');
      }
      const csrfCookie = request.cookies?.ht_csrf as string | undefined;
      const csrfHeader = request.headers['x-csrf-token'];
      if (
        !csrfCookie ||
        typeof csrfHeader !== 'string' ||
        csrfHeader !== csrfCookie
      ) {
        throw new AppError(403, 'CSRF_INVALID', '安全令牌无效');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
