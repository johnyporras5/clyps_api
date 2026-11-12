import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correos de campaña (promo Black Friday) y bajas de promociones.
 *
 * `campaign_email_log`: un correo de una campaña por salón, NUNCA dos. La fila
 * se reserva ANTES de enviar (único por company + campaña): si el envío se
 * corta a la mitad y se relanza, o dos administradores pulsan a la vez, nadie
 * recibe el correo dos veces. `status`: sending → sent | failed.
 *
 * `email_opt_out`: correos que pidieron no recibir promociones (enlace del pie
 * del correo). Solo afecta a las campañas: los correos de citas, pagos y
 * cuenta siguen llegando.
 */
export class CampaignEmails1780000000085 implements MigrationInterface {
  name = 'CampaignEmails1780000000085';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`campaign_email_log\` (
         \`id\` int NOT NULL AUTO_INCREMENT,
         \`company_id\` int NOT NULL,
         \`campaign\` varchar(40) NOT NULL,
         \`email\` varchar(245) NOT NULL,
         \`status\` varchar(12) NOT NULL DEFAULT 'sending',
         \`error\` varchar(255) NULL,
         \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
         \`sent_at\` datetime NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`UQ_campaign_email_log_company_campaign\` (\`company_id\`, \`campaign\`),
         INDEX \`IDX_campaign_email_log_campaign_status\` (\`campaign\`, \`status\`)
       ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`email_opt_out\` (
         \`email\` varchar(245) NOT NULL,
         \`opted_out_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (\`email\`)
       ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`email_opt_out\``);
    await queryRunner.query(`DROP TABLE \`campaign_email_log\``);
  }
}
