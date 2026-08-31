import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de la suscripción (SUB-6 / CLYP-337). Aditiva: crea
 * `subscription_event`.
 *
 * Guarda qué reporte extendió qué período, que es la pregunta de auditoría del
 * ticket y que la tabla `subscription` no puede responder: ahí solo vive la
 * foto actual.
 *
 * El índice ÚNICO sobre `payment_report_id` es la idempotencia: un mismo pago
 * no puede comprar dos meses. Los NULL no chocan entre sí en MySQL, así que
 * quedan libres para eventos que no vengan de un pago.
 *
 * La FK del reporte es SET NULL, no CASCADE: si algún día se borra un reporte,
 * el rastro de que ese período se extendió debe sobrevivir.
 */
export class CreateSubscriptionEvent1780000000059 implements MigrationInterface {
  name = 'CreateSubscriptionEvent1780000000059';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`subscription_event\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`subscription_id\` int NOT NULL,
        \`payment_report_id\` int NULL,
        \`type\` varchar(24) NOT NULL,
        \`plan_id\` varchar(20) NOT NULL,
        \`previous_status\` varchar(16) NULL,
        \`new_status\` varchar(16) NOT NULL,
        \`previous_period_end\` datetime NULL,
        \`new_period_end\` datetime NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_subscription_event_report\` (\`payment_report_id\`),
        INDEX \`IDX_subscription_event_company\` (\`company_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` ADD CONSTRAINT \`FK_subscription_event_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` ADD CONSTRAINT \`FK_subscription_event_subscription\` FOREIGN KEY (\`subscription_id\`) REFERENCES \`subscription\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` ADD CONSTRAINT \`FK_subscription_event_report\` FOREIGN KEY (\`payment_report_id\`) REFERENCES \`payment_report\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` DROP FOREIGN KEY \`FK_subscription_event_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` DROP FOREIGN KEY \`FK_subscription_event_subscription\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_event\` DROP FOREIGN KEY \`FK_subscription_event_company\``,
    );
    await queryRunner.query(`DROP TABLE \`subscription_event\``);
  }
}
