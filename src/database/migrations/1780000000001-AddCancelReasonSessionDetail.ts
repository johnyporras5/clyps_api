import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelReasonSessionDetail1780000000001 implements MigrationInterface {
  name = 'AddCancelReasonSessionDetail1780000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Motivo de cancelación de un servicio (detalle) — lo registra el
    // trabajador (o el admin) al cancelar su servicio.
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`cancel_reason\` text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`cancel_reason\``,
    );
  }
}
