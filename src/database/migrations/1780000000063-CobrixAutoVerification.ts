import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación automática de pagos con Cobrix (SUB-10). Aditiva.
 *
 * Cobrix no es una pasarela de tarjetas: es la plataforma de cobranza que
 * concilia contra los bancos venezolanos. El tenant sigue pagando por Pago
 * Móvil o transferencia, pero quien confirma que el dinero entró es su webhook
 * y ya no un admin mirando el comprobante (SUB-4, que sigue existiendo como
 * respaldo).
 *
 * Tres piezas:
 *
 * 1. `subscription_invoice` — el DOCUMENTO DE COBRO que se emite en Cobrix
 *    ANTES de que el tenant pague. Es lo que hace posible la conciliación: sin
 *    un documento abierto, Cobrix ve un movimiento bancario que no sabe a quién
 *    aplicar. `provider_reference` es nuestra referencia estable: viaja como
 *    `provider_id`, vuelve tal cual en el webhook y es lo que casa el cobro con
 *    la fila. Es ÚNICO — es lo único que impide que una reentrega del webhook,
 *    o dos toques al botón, terminen en dos facturas del mismo mes.
 *
 * 2. `payment_report` gana la dimensión de la conciliación automática
 *    (`auto_check_*`) y el enlace a su factura. `auto_check_status` es
 *    INDEPENDIENTE de `status`: que Cobrix no dé por bueno un pago no lo
 *    rechaza, lo manda a la cola manual. `payer_identification` es la cédula o
 *    el RIF con el que se factura — Cobrix resuelve al cliente por identidad
 *    fiscal y sin eso no emite nada.
 *
 * 3. `payment_gateway_event` — los webhooks ya procesados. El índice ÚNICO
 *    (provider, event_id) ES la idempotencia: Cobrix reparte at-least-once y
 *    reintenta cuatro veces. Va en la BD porque dos entregas simultáneas pasan
 *    cualquier comprobación previa del servicio.
 */
export class CobrixAutoVerification1780000000063 implements MigrationInterface {
  name = 'CobrixAutoVerification1780000000063';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`subscription_invoice\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`subscription_id\` int NOT NULL,
        \`plan_id\` varchar(20) NOT NULL,
        \`provider\` varchar(16) NOT NULL DEFAULT 'cobrix',
        \`provider_reference\` varchar(100) NOT NULL,
        \`provider_invoice_id\` varchar(100) NULL,
        \`checkout_url\` varchar(500) NULL,
        \`amount_minor\` bigint NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`frozen_rate\` decimal(18,4) NULL,
        \`quoted_at\` datetime NULL,
        \`payer_identification\` varchar(30) NOT NULL,
        \`status\` varchar(12) NOT NULL DEFAULT 'open',
        \`expires_at\` datetime NOT NULL,
        \`paid_at\` datetime NULL,
        \`provider_payload\` json NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_subscription_invoice_reference\` (\`provider_reference\`),
        INDEX \`IDX_subscription_invoice_company\` (\`company_id\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\` ADD CONSTRAINT \`FK_subscription_invoice_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\` ADD CONSTRAINT \`FK_subscription_invoice_subscription\` FOREIGN KEY (\`subscription_id\`) REFERENCES \`subscription\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD \`auto_check_status\` varchar(12) NULL,
         ADD \`auto_check_at\` datetime NULL,
         ADD \`auto_check_reason\` varchar(255) NULL,
         ADD \`gateway_payment_id\` varchar(64) NULL,
         ADD \`payer_identification\` varchar(30) NULL,
         ADD \`invoice_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD CONSTRAINT \`CHK_payment_report_auto_check_status\`
         CHECK (\`auto_check_status\` IS NULL OR \`auto_check_status\` IN
           ('pending','approved','rejected','unsupported','expired'))`,
    );
    // La factura sobrevive al reporte y al revés: borrar una no puede llevarse
    // el rastro de la otra.
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` ADD CONSTRAINT \`FK_payment_report_invoice\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`subscription_invoice\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // El barrido del job de conciliación: "los que siguen esperando webhook".
    await queryRunner.query(
      `CREATE INDEX \`IDX_payment_report_auto_check\`
         ON \`payment_report\` (\`status\`, \`auto_check_status\`, \`reported_at\`)`,
    );

    await queryRunner.query(`
      CREATE TABLE \`payment_gateway_event\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`provider\` varchar(16) NOT NULL DEFAULT 'cobrix',
        \`channel\` varchar(16) NOT NULL DEFAULT 'invoice',
        \`event_id\` varchar(160) NOT NULL,
        \`event_type\` varchar(60) NOT NULL,
        \`payment_report_id\` int NULL,
        \`invoice_id\` int NULL,
        \`provider_reference\` varchar(100) NULL,
        \`outcome\` varchar(24) NOT NULL DEFAULT 'received',
        \`detail\` varchar(255) NULL,
        \`payload\` json NOT NULL,
        \`received_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`processed_at\` datetime NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_payment_gateway_event\` (\`provider\`, \`event_id\`),
        INDEX \`IDX_payment_gateway_event_report\` (\`payment_report_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`payment_gateway_event\` ADD CONSTRAINT \`FK_payment_gateway_event_report\` FOREIGN KEY (\`payment_report_id\`) REFERENCES \`payment_report\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_gateway_event\` ADD CONSTRAINT \`FK_payment_gateway_event_invoice\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`subscription_invoice\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`payment_gateway_event\` DROP FOREIGN KEY \`FK_payment_gateway_event_invoice\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_gateway_event\` DROP FOREIGN KEY \`FK_payment_gateway_event_report\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_gateway_event\``);

    await queryRunner.query(
      `DROP INDEX \`IDX_payment_report_auto_check\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP FOREIGN KEY \`FK_payment_report_invoice\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP CHECK \`CHK_payment_report_auto_check_status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         DROP COLUMN \`invoice_id\`,
         DROP COLUMN \`payer_identification\`,
         DROP COLUMN \`gateway_payment_id\`,
         DROP COLUMN \`auto_check_reason\`,
         DROP COLUMN \`auto_check_at\`,
         DROP COLUMN \`auto_check_status\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\` DROP FOREIGN KEY \`FK_subscription_invoice_subscription\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\` DROP FOREIGN KEY \`FK_subscription_invoice_company\``,
    );
    await queryRunner.query(`DROP TABLE \`subscription_invoice\``);
  }
}
