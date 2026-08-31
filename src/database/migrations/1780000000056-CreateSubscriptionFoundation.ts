import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base de datos de suscripciones (SUB-1 / CLYP-333). Aditiva: crea
 * `subscription`, `payment_report` y `reminder_log`.
 *
 * Los planes NO tienen tabla: viven en `plans.config.ts`. Por eso `plan_id` es
 * un varchar sin CHECK — agregar un plan debe ser editar la config, no una
 * migración. Los estados sí llevan CHECK: su vocabulario es una regla del
 * dominio y ningún camino (API, script, import) debe poder inventarse uno.
 *
 * Tampoco hay tabla de cotizaciones: el monto en Bs y su tasa se congelan
 * dentro de `payment_report`.
 */
export class CreateSubscriptionFoundation1780000000056 implements MigrationInterface {
  name = 'CreateSubscriptionFoundation1780000000056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`subscription\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`plan_id\` varchar(20) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'trialing',
        \`trial_ends_at\` datetime NULL,
        \`current_period_end\` datetime NULL,
        \`grace_ends_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_subscription_company\` (\`company_id\`),
        INDEX \`IDX_subscription_status_period\` (\`status\`, \`current_period_end\`),
        CONSTRAINT \`CHK_subscription_status\`
          CHECK (\`status\` IN ('trialing','active','grace','blocked'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`subscription\` ADD CONSTRAINT \`FK_subscription_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE \`payment_report\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`subscription_id\` int NOT NULL,
        \`plan_id\` varchar(20) NOT NULL,
        \`method\` varchar(16) NOT NULL DEFAULT 'pago_movil',
        \`amount_ves_minor\` bigint NULL,
        \`amount_usd_minor\` bigint NULL,
        \`currency\` varchar(3) NOT NULL,
        \`frozen_rate\` decimal(18,4) NULL,
        \`quoted_at\` datetime NULL,
        \`reference\` varchar(64) NOT NULL,
        \`payer_phone\` varchar(20) NULL,
        \`payer_bank_code\` varchar(8) NULL,
        \`payer_email\` varchar(145) NULL,
        \`proof_url\` varchar(245) NULL,
        \`reported_at\` datetime NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'reported',
        \`verification_method\` varchar(8) NULL,
        \`verified_by_user_id\` int NULL,
        \`verified_at\` datetime NULL,
        \`rejection_reason\` varchar(255) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payment_report_company_status\` (\`company_id\`, \`status\`),
        INDEX \`IDX_payment_report_reference\` (\`reference\`),
        CONSTRAINT \`CHK_payment_report_status\`
          CHECK (\`status\` IN ('reported','verified','rejected')),
        CONSTRAINT \`CHK_payment_report_method\`
          CHECK (\`method\` IN ('pago_movil','binance','paypal')),
        CONSTRAINT \`CHK_payment_report_verification_method\`
          CHECK (\`verification_method\` IS NULL
                 OR \`verification_method\` IN ('auto','manual')),
        CONSTRAINT \`CHK_payment_report_currency\`
          CHECK (\`currency\` IN ('VES','USD')),
        -- Un reporte sin monto no se puede conciliar contra nada: exige el de
        -- la moneda que declara (Bs en Pago Móvil, USD en Binance/PayPal).
        CONSTRAINT \`CHK_payment_report_amount_present\`
          CHECK ((\`currency\` = 'VES' AND \`amount_ves_minor\` IS NOT NULL)
                 OR (\`currency\` = 'USD' AND \`amount_usd_minor\` IS NOT NULL)),
        CONSTRAINT \`CHK_payment_report_amounts_positive\`
          CHECK ((\`amount_ves_minor\` IS NULL OR \`amount_ves_minor\` > 0)
                 AND (\`amount_usd_minor\` IS NULL OR \`amount_usd_minor\` > 0))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` ADD CONSTRAINT \`FK_payment_report_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` ADD CONSTRAINT \`FK_payment_report_subscription\` FOREIGN KEY (\`subscription_id\`) REFERENCES \`subscription\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // El verificador se conserva como rastro de auditoría: si el usuario se
    // borra, el reporte sigue verificado pero pierde el nombre (SET NULL).
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` ADD CONSTRAINT \`FK_payment_report_verified_by\` FOREIGN KEY (\`verified_by_user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE \`reminder_log\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`tier\` varchar(16) NOT NULL,
        \`period_end\` datetime NOT NULL,
        \`channel\` varchar(16) NOT NULL,
        \`sent_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_reminder_log_company_tier_period\`
          (\`company_id\`, \`tier\`, \`period_end\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`reminder_log\` ADD CONSTRAINT \`FK_reminder_log_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reminder_log\` DROP FOREIGN KEY \`FK_reminder_log_company\``,
    );
    await queryRunner.query(`DROP TABLE \`reminder_log\``);

    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP FOREIGN KEY \`FK_payment_report_verified_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP FOREIGN KEY \`FK_payment_report_subscription\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP FOREIGN KEY \`FK_payment_report_company\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_report\``);

    await queryRunner.query(
      `ALTER TABLE \`subscription\` DROP FOREIGN KEY \`FK_subscription_company\``,
    );
    await queryRunner.query(`DROP TABLE \`subscription\``);
  }
}
