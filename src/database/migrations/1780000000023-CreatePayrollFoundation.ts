import { MigrationInterface, QueryRunner } from 'typeorm';

// PAY-1: tablas base de nómina. Dinero en céntimos de Bs (bigint).
export class CreatePayrollFoundation1780000000023 implements MigrationInterface {
  name = 'CreatePayrollFoundation1780000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Config de nómina por compañía (una fila por company).
    await queryRunner.query(`
      CREATE TABLE \`payroll_config\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`frequency\` varchar(20) NOT NULL DEFAULT 'quincenal',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_payroll_config_company\` (\`company_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Periodo de pago.
    await queryRunner.query(`
      CREATE TABLE \`payroll_period\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`label\` varchar(100) NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'open',
        \`frequency\` varchar(20) NOT NULL,
        \`starts_at\` datetime NOT NULL,
        \`ends_at\` datetime NOT NULL,
        \`approved_by_user_id\` int NULL,
        \`approved_at\` datetime NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payroll_period_company_status\` (\`company_id\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Detalle por empleado por periodo. Único (period, worker) para get-or-create.
    await queryRunner.query(`
      CREATE TABLE \`period_detail\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`period_id\` int NOT NULL,
        \`company_worker_id\` int NOT NULL,
        \`earned_minor\` bigint NOT NULL DEFAULT 0,
        \`deducted_minor\` bigint NOT NULL DEFAULT 0,
        \`net_minor\` bigint NOT NULL DEFAULT 0,
        \`paid_minor\` bigint NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_period_detail_period_worker\` (\`period_id\`, \`company_worker_id\`),
        INDEX \`IDX_period_detail_company_period\` (\`company_id\`, \`period_id\`),
        CONSTRAINT \`FK_period_detail_period\` FOREIGN KEY (\`period_id\`)
          REFERENCES \`payroll_period\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Conceptos (líneas). Único (source_type, source_id, type) = idempotencia:
    // una cita/propina no genera un concepto duplicado; los manuales (source_id
    // NULL) se permiten repetidos porque MySQL trata los NULL como distintos.
    await queryRunner.query(`
      CREATE TABLE \`payroll_concept\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`period_detail_id\` int NOT NULL,
        \`type\` varchar(20) NOT NULL,
        \`sign\` tinyint NOT NULL,
        \`label\` varchar(145) NOT NULL,
        \`amount_minor\` bigint NOT NULL,
        \`source_type\` varchar(20) NULL,
        \`source_id\` int NULL,
        \`created_by_user_id\` int NULL,
        \`metadata\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_concept_source\` (\`source_type\`, \`source_id\`, \`type\`),
        INDEX \`IDX_payroll_concept_company\` (\`company_id\`),
        INDEX \`IDX_payroll_concept_source\` (\`source_type\`, \`source_id\`),
        CONSTRAINT \`FK_concept_period_detail\` FOREIGN KEY (\`period_detail_id\`)
          REFERENCES \`period_detail\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Pagos registrados. RESTRICT: no borrar un detalle con pagos.
    await queryRunner.query(`
      CREATE TABLE \`payout\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`period_detail_id\` int NOT NULL,
        \`amount_minor\` bigint NOT NULL,
        \`method\` varchar(20) NOT NULL,
        \`reference\` varchar(145) NULL,
        \`recorded_by_user_id\` int NOT NULL,
        \`paid_at\` datetime NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payout_company\` (\`company_id\`),
        INDEX \`IDX_payout_period_detail\` (\`period_detail_id\`),
        CONSTRAINT \`FK_payout_period_detail\` FOREIGN KEY (\`period_detail_id\`)
          REFERENCES \`period_detail\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `payout`');
    await queryRunner.query('DROP TABLE `payroll_concept`');
    await queryRunner.query('DROP TABLE `period_detail`');
    await queryRunner.query('DROP TABLE `payroll_period`');
    await queryRunner.query('DROP TABLE `payroll_config`');
  }
}
