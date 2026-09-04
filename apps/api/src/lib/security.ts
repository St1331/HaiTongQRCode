import { createHmac, randomBytes } from 'node:crypto';

export function createOpaqueToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hmacToken(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function normalizeUserAgent(value: string | undefined): string | null {
  if (!value) return null;
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .slice(0, 500);
}
