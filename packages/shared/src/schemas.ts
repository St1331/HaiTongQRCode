import { z } from 'zod';

import { RECORD_STATUSES, RECORD_TYPES, USER_ROLES } from './domain.js';

const trimmed = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

const optionalTrimmed = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

const nullableTrimmed = (maximum: number) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(maximum)
        .transform((value) => value || null),
      z.null(),
    ])
    .optional();

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: '日期无效',
  });

export const publicTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32}$/, '公开令牌格式无效');

export const fileSha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, 'SHA-256 必须为 64 位十六进制字符')
  .optional()
  .or(z.literal('').transform(() => undefined));

const commonRecordFields = {
  recordNumber: trimmed(1, 100),
  title: trimmed(1, 200),
  issuerName: trimmed(1, 200),
  documentVersion: trimmed(1, 30),
  businessDate: dateStringSchema,
  fileSha256: fileSha256Schema,
  publicRemark: optionalTrimmed(1000),
  internalNote: optionalTrimmed(2000),
};

export const createRecordSchema = z.discriminatedUnion('recordType', [
  z.object({
    recordType: z.literal(RECORD_TYPES[0]),
    ...commonRecordFields,
    tendererName: trimmed(1, 200),
    agencyName: optionalTrimmed(200),
    projectType: trimmed(1, 100),
    publishDate: dateStringSchema,
  }),
  z
    .object({
      recordType: z.literal(RECORD_TYPES[1]),
      ...commonRecordFields,
      counterpartyName: trimmed(1, 200),
      amountDisplay: optionalTrimmed(100),
      signedDate: dateStringSchema,
      validFrom: dateStringSchema.optional(),
      validUntil: dateStringSchema.optional(),
    })
    .refine(
      ({ validFrom, validUntil }) =>
        !validFrom || !validUntil || validFrom <= validUntil,
      { message: '有效期结束日期不能早于开始日期', path: ['validUntil'] },
    ),
]);

export const updateRecordSchema = z
  .object({
    revision: z.number().int().positive(),
    recordNumber: commonRecordFields.recordNumber.optional(),
    title: commonRecordFields.title.optional(),
    issuerName: commonRecordFields.issuerName.optional(),
    documentVersion: commonRecordFields.documentVersion.optional(),
    businessDate: commonRecordFields.businessDate.optional(),
    fileSha256: fileSha256Schema.nullable(),
    publicRemark: nullableTrimmed(1000),
    internalNote: nullableTrimmed(2000),
    tendererName: optionalTrimmed(200),
    agencyName: nullableTrimmed(200),
    projectType: optionalTrimmed(100),
    publishDate: dateStringSchema.optional(),
    counterpartyName: optionalTrimmed(200),
    amountDisplay: nullableTrimmed(100),
    signedDate: dateStringSchema.optional(),
    validFrom: dateStringSchema.nullable().optional(),
    validUntil: dateStringSchema.nullable().optional(),
  })
  .refine(
    ({ validFrom, validUntil }) =>
      !validFrom || !validUntil || validFrom <= validUntil,
    {
      message: '有效期结束日期不能早于开始日期',
      path: ['validUntil'],
    },
  );

export const statusChangeSchema = z
  .object({
    revision: z.number().int().positive(),
    status: z.enum(RECORD_STATUSES),
    reason: optionalTrimmed(500),
  })
  .superRefine(({ status, reason }, context) => {
    if (
      (status === 'CHANGED' || status === 'VOID') &&
      (!reason || reason.length < 5)
    ) {
      context.addIssue({
        code: 'custom',
        message: '变更或作废原因至少需要 5 个字符',
        path: ['reason'],
      });
    }
  });

export const loginSchema = z.object({
  username: trimmed(3, 50).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(10).max(128),
  newPassword: z.string().min(12).max(128),
});

export const createUserSchema = z.object({
  username: trimmed(3, 50)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .transform((value) => value.toLowerCase()),
  displayName: trimmed(1, 100),
  password: z.string().min(12).max(128),
  role: z.enum(USER_ROLES),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
