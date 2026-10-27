import { describe, expect, it } from 'vitest';

import {
  APP_NAME,
  canTransitionRecordStatus,
  createRecordSchema,
  hasPermission,
  statusChangeSchema,
  updateRecordSchema,
} from './index.js';

describe('shared package', () => {
  it('exports the canonical application name', () => {
    expect(APP_NAME).toBe('HaiTongQRcode');
  });

  it('enforces the record state machine', () => {
    expect(canTransitionRecordStatus('DRAFT', 'ACTIVE')).toBe(true);
    expect(canTransitionRecordStatus('ACTIVE', 'DRAFT')).toBe(false);
    expect(canTransitionRecordStatus('VOID', 'ACTIVE')).toBe(false);
  });

  it('keeps permissions deny-by-default', () => {
    expect(hasPermission('EDITOR', 'records:write')).toBe(true);
    expect(hasPermission('VIEWER', 'records:write')).toBe(false);
  });

  it('normalizes and validates record input', () => {
    const result = createRecordSchema.parse({
      recordType: 'TENDER_DOCUMENT',
      recordNumber: ' HT-001 ',
      title: ' 测试招标文件 ',
      issuerName: ' 海通公司 ',
      documentVersion: ' V1 ',
      businessDate: '2026-09-03',
      tendererName: ' 海通公司 ',
      projectType: ' 工程 ',
      publishDate: '2026-09-03',
    });

    expect(result.recordNumber).toBe('HT-001');
    expect(result.publicRemark).toBeUndefined();
  });

  it('requires a reason for changed and void states', () => {
    expect(
      statusChangeSchema.safeParse({
        revision: 1,
        status: 'VOID',
        reason: '短',
      }).success,
    ).toBe(false);
  });

  it('accepts explicit nulls when clearing optional edit fields', () => {
    expect(
      updateRecordSchema.parse({
        revision: 2,
        publicRemark: null,
        internalNote: null,
        amountDisplay: null,
        validUntil: null,
      }),
    ).toMatchObject({
      revision: 2,
      publicRemark: null,
      internalNote: null,
      amountDisplay: null,
      validUntil: null,
    });
  });
});
