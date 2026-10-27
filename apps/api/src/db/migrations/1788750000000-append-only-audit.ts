import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AppendOnlyAudit1788750000000 implements MigrationInterface {
  name = 'AppendOnlyAudit1788750000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '23000'; END $$`);
    await queryRunner.query(
      'CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation()',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER audit_logs_append_only ON audit_logs',
    );
    await queryRunner.query('DROP FUNCTION prevent_audit_mutation()');
  }
}
