export const USER_ROLES = ['SUPER_ADMIN', 'EDITOR', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const RECORD_TYPES = ['TENDER_DOCUMENT', 'CONTRACT'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_STATUSES = ['DRAFT', 'ACTIVE', 'CHANGED', 'VOID'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const STATUS_LABELS: Record<RecordStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '有效',
  CHANGED: '已变更',
  VOID: '已作废',
};

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'records:read',
    'records:write',
    'records:status',
    'records:rotate-token',
    'users:manage',
    'audit:read',
  ],
  EDITOR: ['records:read', 'records:write', 'records:status'],
  VIEWER: ['records:read'],
} as const satisfies Record<UserRole, readonly string[]>;

export type Permission = (typeof ROLE_PERMISSIONS)[UserRole][number];

const STATUS_TRANSITIONS: Record<RecordStatus, readonly RecordStatus[]> = {
  DRAFT: ['ACTIVE', 'VOID'],
  ACTIVE: ['CHANGED', 'VOID'],
  CHANGED: ['ACTIVE', 'VOID'],
  VOID: [],
};

export function canTransitionRecordStatus(
  from: RecordStatus,
  to: RecordStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
