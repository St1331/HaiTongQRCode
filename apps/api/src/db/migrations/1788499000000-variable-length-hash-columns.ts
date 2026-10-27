import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VariableLengthHashColumns1788499000000 implements MigrationInterface {
  name = 'VariableLengthHashColumns1788499000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE verification_records
         ALTER COLUMN public_token TYPE varchar(32) USING trim(public_token)`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_sessions
         ALTER COLUMN token_hash TYPE varchar(64) USING trim(token_hash),
         ALTER COLUMN csrf_hash TYPE varchar(64) USING trim(csrf_hash)`,
    );
    await queryRunner.query(
      `ALTER TABLE verification_records
         ALTER COLUMN file_sha256 TYPE varchar(64) USING trim(file_sha256)`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_logs
         ALTER COLUMN ip_hmac TYPE varchar(64) USING trim(ip_hmac)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs
         ALTER COLUMN ip_hmac TYPE char(64) USING ip_hmac::char(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE verification_records
         ALTER COLUMN file_sha256 TYPE char(64) USING file_sha256::char(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_sessions
         ALTER COLUMN token_hash TYPE char(64) USING token_hash::char(64),
         ALTER COLUMN csrf_hash TYPE char(64) USING csrf_hash::char(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE verification_records
         ALTER COLUMN public_token TYPE char(32) USING public_token::char(32)`,
    );
  }
}
