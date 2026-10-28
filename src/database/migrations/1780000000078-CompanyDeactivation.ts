import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Salón desactivado por el administrador de la plataforma.
 *
 * No es un borrado: el salón y todo lo suyo se quedan en la base. Mientras
 * `deactivated_at` tenga fecha, el dueño y sus trabajadores no entran, nadie
 * puede reservar ahí y no les sale ni un correo ni un push. Reactivarlo es
 * volver a dejar la columna en NULL.
 *
 * Todos los salones que ya existen nacen activos.
 */
export class CompanyDeactivation1780000000078 implements MigrationInterface {
  name = 'CompanyDeactivation1780000000078';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\`
         ADD \`deactivated_at\` datetime NULL,
         ADD \`deactivated_by\` int NULL,
         ADD \`deactivation_reason\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\`
         DROP COLUMN \`deactivation_reason\`,
         DROP COLUMN \`deactivated_by\`,
         DROP COLUMN \`deactivated_at\``,
    );
  }
}
