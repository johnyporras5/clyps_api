import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comisiones por ROL (además de por persona). Un rol genérico ("Lavado de
 * cabello", "Recepción", …) con su % o monto; en el cobro se elige QUIÉN lo
 * hizo. Reusa `standing_commission`: una fila es por trabajador
 * (company_worker_id) o por rol (commission_role_id), nunca ambos.
 */
export class AddCommissionRoles1780000000053 implements MigrationInterface {
  name = 'AddCommissionRoles1780000000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Catálogo de roles por compañía (el admin los administra).
    await queryRunner.query(`
      CREATE TABLE \`commission_role\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`name\` varchar(80) NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_commission_role_company\` (\`company_id\`),
        CONSTRAINT \`FK_commission_role_company\`
          FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2) standing_commission: el trabajador ahora es opcional (filas por rol).
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` DROP FOREIGN KEY \`FK_standing_commission_worker\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` MODIFY \`company_worker_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\`
         ADD CONSTRAINT \`FK_standing_commission_worker\`
         FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`)
         ON DELETE CASCADE`,
    );

    // 3) standing_commission: fila "por rol".
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` ADD \`commission_role_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\`
         ADD KEY \`IDX_standing_commission_role\` (\`commission_role_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\`
         ADD CONSTRAINT \`FK_standing_commission_role\`
         FOREIGN KEY (\`commission_role_id\`) REFERENCES \`commission_role\`(\`id\`)
         ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` DROP FOREIGN KEY \`FK_standing_commission_role\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` DROP KEY \`IDX_standing_commission_role\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`standing_commission\` DROP COLUMN \`commission_role_id\``,
    );
    // Nota: no revertimos company_worker_id a NOT NULL (podrían existir filas por rol).
    await queryRunner.query(`DROP TABLE \`commission_role\``);
  }
}
