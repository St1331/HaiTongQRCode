import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { argon2id, hash, verify } from 'argon2';
import type { DataSource } from 'typeorm';

import { changePasswordSchema, loginSchema } from '@haitong/shared';

import type { AppConfig } from '../config/env.js';
import type { UserRow } from '../db/types.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/app-error.js';
import { addMinutes, createOpaqueToken, hmacToken } from '../lib/security.js';
import { getAuth, requireAuth, requireCsrf } from '../middleware/auth.js';

const SESSION_COOKIE = 'ht_session';
const CSRF_COOKIE = 'ht_csrf';

function cookieOptions(config: AppConfig, httpOnly: boolean) {
  return {
    httpOnly,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/api/v1',
  };
}

function userDto(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}

export function createAuthRouter(dataSource: DataSource, config: AppConfig) {
  const router = Router();
  const auditLoginFailure = async (
    requestId: string,
    request: Request,
    user: UserRow | undefined,
    reason: string,
  ) => {
    await dataSource.transaction((manager) =>
      writeAudit(manager, config, {
        ...(user ? { actor: userDto(user), resourceId: user.id } : {}),
        action: 'AUTH_LOGIN_REJECTED',
        resourceType: 'USER',
        summary: { reason },
        requestId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      }),
    );
  };
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response, _next, options) => {
      response.status(options.statusCode).json({
        error: {
          code: 'LOGIN_RATE_LIMITED',
          message: '登录尝试过于频繁，请稍后再试',
          details: null,
        },
        requestId: response.locals.requestId as string,
      });
    },
  });

  router.post('/login', loginLimiter, async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body);
      const rows = (await dataSource.query(
        'SELECT * FROM users WHERE username = $1 LIMIT 1',
        [input.username],
      )) as UserRow[];
      const user = rows[0];
      const now = new Date();

      if (!user) {
        await hash(input.password, { type: argon2id });
        await auditLoginFailure(
          String(response.locals.requestId),
          request,
          undefined,
          'INVALID_CREDENTIALS',
        );
        throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
      }
      if (user.status !== 'ACTIVE') {
        await auditLoginFailure(
          String(response.locals.requestId),
          request,
          user,
          'ACCOUNT_DISABLED',
        );
        throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
      }
      if (user.locked_until && new Date(user.locked_until) > now) {
        await auditLoginFailure(
          String(response.locals.requestId),
          request,
          user,
          'ACCOUNT_LOCKED',
        );
        throw new AppError(423, 'ACCOUNT_LOCKED', '账户已临时锁定，请稍后再试');
      }

      const passwordValid = await verify(user.password_hash, input.password);
      if (!passwordValid) {
        const failures = user.failed_login_count + 1;
        const lockedUntil = failures >= 5 ? addMinutes(now, 15) : null;
        await dataSource.transaction(async (manager) => {
          await manager.query(
            'UPDATE users SET failed_login_count = $1, locked_until = $2, updated_at = now() WHERE id = $3',
            [lockedUntil ? 0 : failures, lockedUntil, user.id],
          );
          await writeAudit(manager, config, {
            actor: userDto(user),
            action: 'AUTH_LOGIN_REJECTED',
            resourceType: 'USER',
            resourceId: user.id,
            summary: { reason: 'INVALID_CREDENTIALS' },
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
      }

      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const absoluteExpiry = addMinutes(now, config.SESSION_ABSOLUTE_MINUTES);
      const idleExpiry = addMinutes(now, config.SESSION_IDLE_MINUTES);
      const requestId = String(response.locals.requestId);

      await dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE users SET failed_login_count = 0, locked_until = NULL,
             last_login_at = now(), updated_at = now() WHERE id = $1`,
          [user.id],
        );
        await manager.query(
          `INSERT INTO auth_sessions
            (token_hash, csrf_hash, user_id, idle_expires_at, absolute_expires_at, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            hmacToken(config.SESSION_HMAC_SECRET, sessionToken),
            hmacToken(config.SESSION_HMAC_SECRET, csrfToken),
            user.id,
            idleExpiry,
            absoluteExpiry,
            request.get('user-agent')?.slice(0, 500) ?? null,
          ],
        );
        await writeAudit(manager, config, {
          actor: userDto(user),
          action: 'AUTH_LOGIN',
          resourceType: 'USER',
          resourceId: user.id,
          requestId,
          ip: request.ip,
          userAgent: request.get('user-agent'),
        });
      });

      response.cookie(
        SESSION_COOKIE,
        sessionToken,
        cookieOptions(config, true),
      );
      response.cookie(CSRF_COOKIE, csrfToken, cookieOptions(config, false));
      response.status(200).json({ data: userDto(user), csrfToken, requestId });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAuth(dataSource, config));

  router.get('/me', (_request, response) => {
    response.status(200).json({
      data: getAuth(response),
      csrfToken: response.req.cookies?.ht_csrf as string,
      requestId: response.locals.requestId as string,
    });
  });

  router.post(
    '/logout',
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const token = request.cookies?.ht_session as string;
        await dataSource.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1',
          [hmacToken(config.SESSION_HMAC_SECRET, token)],
        );
        response.clearCookie(SESSION_COOKIE, cookieOptions(config, true));
        response.clearCookie(CSRF_COOKIE, cookieOptions(config, false));
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/change-password',
    requireCsrf(config),
    async (request, response, next) => {
      try {
        const input = changePasswordSchema.parse(request.body);
        const auth = getAuth(response);
        const rows = (await dataSource.query(
          'SELECT * FROM users WHERE id = $1 LIMIT 1',
          [auth.id],
        )) as UserRow[];
        const user = rows[0];
        if (
          !user ||
          !(await verify(user.password_hash, input.currentPassword))
        ) {
          throw new AppError(400, 'CURRENT_PASSWORD_INVALID', '当前密码错误');
        }
        const passwordHash = await hash(input.newPassword, { type: argon2id });
        await dataSource.transaction(async (manager) => {
          await manager.query(
            `UPDATE users SET password_hash = $1, password_changed_at = now(),
               updated_at = now() WHERE id = $2`,
            [passwordHash, auth.id],
          );
          await manager.query(
            `UPDATE auth_sessions SET revoked_at = now()
              WHERE user_id = $1 AND revoked_at IS NULL`,
            [auth.id],
          );
          await writeAudit(manager, config, {
            actor: auth,
            action: 'AUTH_PASSWORD_CHANGED',
            resourceType: 'USER',
            resourceId: auth.id,
            requestId: String(response.locals.requestId),
            ip: request.ip,
            userAgent: request.get('user-agent'),
          });
        });
        response.clearCookie(SESSION_COOKIE, cookieOptions(config, true));
        response.clearCookie(CSRF_COOKIE, cookieOptions(config, false));
        response.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
