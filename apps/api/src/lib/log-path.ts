// Log route categories, never caller-controlled tokens, identifiers or query strings.
export function logPath(url: unknown): string {
  if (typeof url !== 'string') return '/unknown';
  const path = url.split('?')[0] ?? '';
  if (/^\/api\/v1\/public\/records\/[^/]+$/.test(path))
    return '/api/v1/public/records/:token';
  if (
    /^\/api\/v1\/admin\/records\/[^/]+(?:\/(?:status|rotate-token|versions|qrcode))?$/.test(
      path,
    )
  )
    return '/api/v1/admin/records/:id';
  if (/^\/api\/v1\/admin\/users\/[^/]+(?:\/reset-password)?$/.test(path))
    return '/api/v1/admin/users/:id';
  if (
    /^\/api\/v1\/(?:health|ready|auth\/(?:login|logout|me|change-password)|admin\/(?:records|users|audit-logs))$/.test(
      path,
    )
  )
    return path;
  return '/unmatched';
}
