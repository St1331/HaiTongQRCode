import { describe, expect, it } from 'vitest';

import { createOpaqueToken, hmacToken } from './security.js';

describe('security utilities', () => {
  it('creates a 192-bit base64url token', () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(24);
  });

  it('uses keyed hashing for stored tokens', () => {
    expect(hmacToken('a'.repeat(32), 'token')).toMatch(/^[a-f0-9]{64}$/);
    expect(hmacToken('a'.repeat(32), 'token')).not.toBe(
      hmacToken('b'.repeat(32), 'token'),
    );
  });
});
