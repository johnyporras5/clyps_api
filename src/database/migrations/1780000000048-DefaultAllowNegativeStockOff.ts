import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ahora que "permitir vender sin stock" es configurable desde el front, su valor
 * por defecto pasa a INACTIVO (0 = bloquear venta sin stock). Además se pone en 0
 * a las compañías existentes (nadie lo había elegido conscientemente: no había
 * UI y el default anterior era 1). El admin puede reactivarlo en Configuración.
 */
export class DefaultAllowNegativeStockOff1780000000048 implements MigrationInterface {
  name = 'DefaultAllowNegativeStockOff1780000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\` MODIFY \`allow_negative_stock\` tinyint(1) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE \`company\` SET \`allow_negative_stock\` = 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\` MODIFY \`allow_negative_stock\` tinyint(1) NOT NULL DEFAULT 1`,
    );
  }
}
