'use client';

import { STATUS_LABELS, type RecordStatus } from '@haitong/shared';
import { Tag } from 'antd';

const colors: Record<RecordStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  CHANGED: 'warning',
  VOID: 'error',
};

export function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <Tag
      color={colors[status]}
      className={`status status-${status.toLowerCase()}`}
      role="status"
    >
      <span aria-hidden="true">●</span> {STATUS_LABELS[status]}
    </Tag>
  );
}
