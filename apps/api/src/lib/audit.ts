import type { EntityManager } from 'typeorm';

import type { AuthenticatedUser } from '../db/types.js';
import type { AppConfig } from '../config/env.js';
import { hmacToken, normalizeUserAgent } from './security.js';

interface AuditInput {
  actor?: AuthenticatedUser;
  action: string;
  resourceType: string;
  resourceId?: string;
  summary?: Record<string, unknown>;
  requestId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export async function writeAudit(
  manager: EntityManager,
  config: AppConfig,
  input: AuditInput,
): Promise<void> {
  const ipHmac = input.ip ? hmacToken(config.IP_HMAC_SECRET, input.ip) : null;
  await manager.query(
    `INSERT INTO audit_logs
      (actor_id, action, resource_type, resource_id, summary, request_id, ip_hmac, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      input.actor?.id ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      JSON.stringify(input.summary ?? {}),
      input.requestId,
      ipHmac,
      normalizeUserAgent(input.userAgent),
    ],
  );
}
