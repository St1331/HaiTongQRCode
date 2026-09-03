import { describe, expect, it } from 'vitest';

import { apiBootstrap } from './index.js';

describe('api bootstrap', () => {
  it('exposes the shared application name', () => {
    expect(apiBootstrap.appName).toBe('HaiTongQRcode');
  });
});
