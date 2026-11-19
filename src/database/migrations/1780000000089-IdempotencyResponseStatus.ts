import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-OFF-2: un recibo de idempotencia también puede guardar un rechazo
 * definitivo (409 SLOT_TAKEN), no solo un éxito. `response_status` dice con
 * qué código se repite la respuesta.
 *
 * NULL = éxito (los recibos que ya existen): se repite con el código normal
 * del endpoint (201).
 */
export class IdempotencyResponseStatus1780000000089 implements MigrationInterface {
  name = 'IdempotencyResponseStatus1780000000089';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`idempotency_key\`
         ADD \`response_status\` smallint NULL AFTER \`status\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`idempotency_key\` DROP COLUMN \`response_status\``,
    );
  }
}
