import { describe, expect, it } from 'vitest';

import { returningRows } from './query-result.js';

describe('TypeORM raw query compatibility', () => {
  it('unwraps PostgreSQL UPDATE RETURNING results', () => {
    expect(returningRows<{ id: string }>([[{ id: 'record-id' }], 1])).toEqual([
      { id: 'record-id' },
    ]);
  });

  it('keeps INSERT RETURNING results intact', () => {
    expect(returningRows<{ id: string }>([{ id: 'record-id' }])).toEqual([
      { id: 'record-id' },
    ]);
  });
});
