import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchAndAuditIndexes1788498000000 implements MigrationInterface {
  name = 'SearchAndAuditIndexes1788498000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(
      `CREATE INDEX verification_records_number_trgm_idx
         ON verification_records USING gin (record_number gin_trgm_ops)
         WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX verification_records_title_trgm_idx
         ON verification_records USING gin (title gin_trgm_ops)
         WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_logs_actor_created_idx
         ON audit_logs (actor_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_logs_action_created_idx
         ON audit_logs (action, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS audit_logs_action_created_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS audit_logs_actor_created_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS verification_records_title_trgm_idx',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS verification_records_number_trgm_idx',
    );
  }
}
