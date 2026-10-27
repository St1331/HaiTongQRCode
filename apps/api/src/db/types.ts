import type {
  RecordStatus,
  RecordType,
  UserRole,
  UserStatus,
} from '@haitong/shared';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  password_changed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface VerificationRecordRow {
  id: string;
  record_type: RecordType;
  public_token: string;
  record_number: string;
  title: string;
  issuer_name: string;
  document_version: string;
  status: RecordStatus;
  business_date: string | Date;
  file_sha256: string | null;
  public_remark: string | null;
  internal_note: string | null;
  tenderer_name: string | null;
  agency_name: string | null;
  project_type: string | null;
  publish_date: string | Date | null;
  counterparty_name: string | null;
  amount_display: string | null;
  signed_date: string | Date | null;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
