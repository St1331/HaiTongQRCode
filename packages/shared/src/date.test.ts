import { describe, expect, it } from 'vitest';
import { dateStringSchema } from './schemas.js';

describe('business calendar dates', () => {
  it.each([
    '2026-02-30',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
  ])('rejects nonexistent date %s', (value) => {
    expect(dateStringSchema.safeParse(value).success).toBe(false);
  });
  it.each(['2024-02-29', '2026-02-28', '2026-12-31'])(
    'accepts real date %s',
    (value) => {
      expect(dateStringSchema.parse(value)).toBe(value);
    },
  );
});
