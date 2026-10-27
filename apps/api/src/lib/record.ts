import type { CreateRecordInput } from '@haitong/shared';

import type { VerificationRecordRow } from '../db/types.js';

function dateValue(value: string | Date): string {
  return typeof value === 'string'
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function optionalDateValue(value: string | Date | null): string | undefined {
  return value ? dateValue(value) : undefined;
}

export function rowToInput(row: VerificationRecordRow): CreateRecordInput {
  const common = {
    recordNumber: row.record_number,
    title: row.title,
    issuerName: row.issuer_name,
    documentVersion: row.document_version,
    businessDate: dateValue(row.business_date),
    fileSha256: row.file_sha256 ?? undefined,
    publicRemark: row.public_remark ?? undefined,
    internalNote: row.internal_note ?? undefined,
  };
  if (row.record_type === 'TENDER_DOCUMENT') {
    return {
      recordType: 'TENDER_DOCUMENT',
      ...common,
      tendererName: row.tenderer_name ?? '',
      agencyName: row.agency_name ?? undefined,
      projectType: row.project_type ?? '',
      publishDate: optionalDateValue(row.publish_date) ?? '',
    };
  }
  return {
    recordType: 'CONTRACT',
    ...common,
    counterpartyName: row.counterparty_name ?? '',
    amountDisplay: row.amount_display ?? undefined,
    signedDate: optionalDateValue(row.signed_date) ?? '',
    validFrom: optionalDateValue(row.valid_from),
    validUntil: optionalDateValue(row.valid_until),
  };
}

export function publicRecordDto(
  row: VerificationRecordRow,
  publishContractAmount: boolean,
) {
  const common = {
    recordType: row.record_type,
    recordNumber: row.record_number,
    title: row.title,
    issuerName: row.issuer_name,
    documentVersion: row.document_version,
    status: row.status,
    businessDate: dateValue(row.business_date),
    updatedAt: row.updated_at,
    ...(row.file_sha256 ? { fileSha256: row.file_sha256 } : {}),
    ...(row.public_remark ? { publicRemark: row.public_remark } : {}),
  };
  if (row.record_type === 'TENDER_DOCUMENT') {
    return {
      ...common,
      tendererName: row.tenderer_name,
      agencyName: row.agency_name,
      projectType: row.project_type,
      publishDate: optionalDateValue(row.publish_date),
    };
  }
  return {
    ...common,
    counterpartyName: row.counterparty_name,
    ...(publishContractAmount && row.amount_display
      ? { amountDisplay: row.amount_display }
      : {}),
    signedDate: optionalDateValue(row.signed_date),
    validFrom: optionalDateValue(row.valid_from),
    validUntil: optionalDateValue(row.valid_until),
  };
}

export function adminRecordDto(
  row: VerificationRecordRow,
  publicBaseUrl: string,
) {
  return {
    id: row.id,
    publicToken: row.public_token,
    verificationUrl: `${publicBaseUrl.replace(/\/$/, '')}/v/${row.public_token}`,
    ...rowToInput(row),
    status: row.status,
    revision: row.revision,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function recordInsertValues(input: CreateRecordInput) {
  return [
    input.recordType,
    input.recordNumber,
    input.title,
    input.issuerName,
    input.documentVersion,
    input.businessDate,
    input.fileSha256 ?? null,
    input.publicRemark ?? null,
    input.internalNote ?? null,
    input.recordType === 'TENDER_DOCUMENT' ? input.tendererName : null,
    input.recordType === 'TENDER_DOCUMENT' ? (input.agencyName ?? null) : null,
    input.recordType === 'TENDER_DOCUMENT' ? input.projectType : null,
    input.recordType === 'TENDER_DOCUMENT' ? input.publishDate : null,
    input.recordType === 'CONTRACT' ? input.counterpartyName : null,
    input.recordType === 'CONTRACT' ? (input.amountDisplay ?? null) : null,
    input.recordType === 'CONTRACT' ? input.signedDate : null,
    input.recordType === 'CONTRACT' ? (input.validFrom ?? null) : null,
    input.recordType === 'CONTRACT' ? (input.validUntil ?? null) : null,
  ];
}
