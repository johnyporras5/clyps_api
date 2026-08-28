import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comisiones fijas (recurrentes) por servicio para trabajadores que no ejecutan.
 * Una tabla cubre regla global (todos los servicios), específica por servicio y
 * exclusiones ("todos menos este"). Solo servicios; solo comisión.
 */
export class CreateStandingCommission1780000000052 implements MigrationInterface {
  name = 'CreateStandingCommission1780000000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`standing_commission\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`company_worker_id\` int NOT NULL,
        \`scope\` enum('all_services','service') NOT NULL,
        \`service_id\` int NULL,
        \`is_exclusion\` tinyint NOT NULL DEFAULT 0,
        \`basis_mode\` enum('percentage','fixed') NULL,
        \`value\` int NULL,
        \`currency\` varchar(3) NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_standing_commission_company\` (\`company_id\`),
        KEY \`IDX_standing_commission_worker\` (\`company_worker_id\`),
        KEY \`IDX_standing_commission_service\` (\`service_id\`),
        CONSTRAINT \`FK_standing_commission_worker\`
          FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_standing_commission_service\`
          FOREIGN KEY (\`service_id\`) REFERENCES \`service\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`standing_commission\``);
  }
}
