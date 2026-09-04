import { describe, expect, it } from 'vitest';

import type { VerificationRecordRow } from '../db/types.js';
import { publicRecordDto } from './record.js';

const contract = {
  id: 'record-id',
  record_type: 'CONTRACT',
  public_token: 'a'.repeat(32),
  record_number: 'HT-001',
  title: '合同',
  issuer_name: '海通',
  document_version: 'V1',
  status: 'ACTIVE',
  business_date: '2026-09-03',
  file_sha256: null,
  public_remark: null,
  internal_note: '绝不公开',
  tenderer_name: null,
  agency_name: null,
  project_type: null,
  publish_date: null,
  counterparty_name: '合作方',
  amount_display: '人民币 100 万元',
  signed_date: '2026-09-03',
  valid_from: null,
  valid_until: null,
  revision: 1,
  created_by: 'user-id',
  updated_by: 'user-id',
  created_at: new Date('2026-09-03T00:00:00Z'),
  updated_at: new Date('2026-09-03T00:00:00Z'),
  deleted_at: null,
} satisfies VerificationRecordRow;

describe('public record DTO', () => {
  it('excludes internal fields and contract amount by default', () => {
    const dto = publicRecordDto(contract, false);
    expect(dto).not.toHaveProperty('internalNote');
    expect(dto).not.toHaveProperty('id');
    expect(dto).not.toHaveProperty('publicToken');
    expect(dto).not.toHaveProperty('amountDisplay');
  });

  it('only includes amount after explicit configuration', () => {
    expect(publicRecordDto(contract, true)).toMatchObject({
      amountDisplay: '人民币 100 万元',
    });
  });
});
