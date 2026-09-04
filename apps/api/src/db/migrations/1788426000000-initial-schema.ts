import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788426000000 implements MigrationInterface {
  name = 'InitialSchema1788426000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(50) NOT NULL,
        display_name varchar(100) NOT NULL,
        password_hash text NOT NULL,
        role varchar(20) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'ACTIVE',
        failed_login_count integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        last_login_at timestamptz,
        password_changed_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_username_normalized CHECK (username = lower(trim(username))),
        CONSTRAINT users_role_valid CHECK (role IN ('SUPER_ADMIN', 'EDITOR', 'VIEWER')),
        CONSTRAINT users_status_valid CHECK (status IN ('ACTIVE', 'DISABLED')),
        CONSTRAINT users_failed_login_count_valid CHECK (failed_login_count >= 0),
        CONSTRAINT users_username_length CHECK (char_length(username) BETWEEN 3 AND 50),
        CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 100)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX users_username_unique ON users (username)',
    );

    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash char(64) NOT NULL,
        csrf_hash char(64) NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idle_expires_at timestamptz NOT NULL,
        absolute_expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        user_agent varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT auth_sessions_expiry_valid CHECK (idle_expires_at <= absolute_expires_at)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX auth_sessions_token_hash_unique ON auth_sessions (token_hash)',
    );
    await queryRunner.query(
      'CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id)',
    );
    await queryRunner.query(
      'CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (idle_expires_at, absolute_expires_at) WHERE revoked_at IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE verification_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_type varchar(30) NOT NULL,
        public_token char(32) NOT NULL,
        record_number varchar(100) NOT NULL,
        title varchar(200) NOT NULL,
        issuer_name varchar(200) NOT NULL,
        document_version varchar(30) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'DRAFT',
        business_date date NOT NULL,
        file_sha256 char(64),
        public_remark varchar(1000),
        internal_note varchar(2000),
        tenderer_name varchar(200),
        agency_name varchar(200),
        project_type varchar(100),
        publish_date date,
        counterparty_name varchar(200),
        amount_display varchar(100),
        signed_date date,
        valid_from date,
        valid_until date,
        revision integer NOT NULL DEFAULT 1,
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT verification_records_type_valid CHECK (record_type IN ('TENDER_DOCUMENT', 'CONTRACT')),
        CONSTRAINT verification_records_status_valid CHECK (status IN ('DRAFT', 'ACTIVE', 'CHANGED', 'VOID')),
        CONSTRAINT verification_records_revision_valid CHECK (revision > 0),
        CONSTRAINT verification_records_common_lengths CHECK (
          char_length(record_number) BETWEEN 1 AND 100 AND
          char_length(title) BETWEEN 1 AND 200 AND
          char_length(issuer_name) BETWEEN 1 AND 200 AND
          char_length(document_version) BETWEEN 1 AND 30
        ),
        CONSTRAINT verification_records_sha256_valid CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[a-f0-9]{64}$'),
        CONSTRAINT verification_records_type_fields CHECK (
          (record_type = 'TENDER_DOCUMENT' AND tenderer_name IS NOT NULL AND project_type IS NOT NULL AND publish_date IS NOT NULL AND counterparty_name IS NULL AND signed_date IS NULL)
          OR
          (record_type = 'CONTRACT' AND counterparty_name IS NOT NULL AND signed_date IS NOT NULL AND tenderer_name IS NULL AND project_type IS NULL AND publish_date IS NULL)
        ),
        CONSTRAINT verification_records_valid_period CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX verification_records_public_token_unique ON verification_records (public_token)',
    );
    await queryRunner.query(
      'CREATE INDEX verification_records_number_idx ON verification_records (lower(record_number)) WHERE deleted_at IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX verification_records_list_idx ON verification_records (updated_at DESC, id) WHERE deleted_at IS NULL',
    );
    await queryRunner.query(
      'CREATE INDEX verification_records_status_idx ON verification_records (status) WHERE deleted_at IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE record_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES verification_records(id) ON DELETE RESTRICT,
        version_no integer NOT NULL,
        snapshot jsonb NOT NULL,
        change_reason varchar(500),
        changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT record_versions_version_positive CHECK (version_no > 0),
        CONSTRAINT record_versions_unique UNIQUE (record_id, version_no)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX record_versions_record_idx ON record_versions (record_id, version_no DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(100) NOT NULL,
        resource_type varchar(100) NOT NULL,
        resource_id uuid,
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        request_id varchar(80) NOT NULL,
        ip_hmac char(64),
        user_agent varchar(500),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC, id)',
    );
    await queryRunner.query(
      'CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id, created_at DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP TABLE IF EXISTS record_versions');
    await queryRunner.query('DROP TABLE IF EXISTS verification_records');
    await queryRunner.query('DROP TABLE IF EXISTS auth_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}
