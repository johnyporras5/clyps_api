import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicBookingModes1780000000079 implements MigrationInterface {
  name = 'PublicBookingModes1780000000079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`company_booking_settings\` (
        \`company_id\` int NOT NULL,
        \`mode\` varchar(10) NOT NULL DEFAULT 'free',
        \`lead_minutes\` int NOT NULL DEFAULT 60,
        \`hold_hours\` int NOT NULL DEFAULT 24,
        \`workers_can_approve\` tinyint NOT NULL DEFAULT 0,
        \`deposit_type\` varchar(10) NULL,
        \`deposit_amount\` decimal(12,2) NULL,
        \`deposit_percent\` int NULL,
        \`deposit_currency\` varchar(3) NULL,
        \`payment_instructions\` varchar(1000) NULL,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`company_id\`),
        CONSTRAINT \`CHK_company_booking_settings_mode\`
          CHECK (\`mode\` IN ('free','approval','deposit'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`public_booking_request\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`session_id\` int NOT NULL,
        \`company_id\` int NOT NULL,
        \`status\` varchar(20) NOT NULL,
        \`guest_name\` varchar(145) NOT NULL,
        \`guest_email\` varchar(145) NOT NULL,
        \`guest_phone\` varchar(20) NULL,
        \`expires_at\` datetime NULL,
        \`deposit_amount\` decimal(12,2) NULL,
        \`deposit_currency\` varchar(3) NULL,
        \`payment_reference\` varchar(60) NULL,
        \`payment_proof_url\` varchar(500) NULL,
        \`rejection_reason\` varchar(300) NULL,
        \`reviewed_by_user_id\` int NULL,
        \`reviewed_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_public_booking_request_session\` (\`session_id\`),
        KEY \`IDX_public_booking_request_company_status\` (\`company_id\`, \`status\`),
        KEY \`IDX_public_booking_request_expires\` (\`status\`, \`expires_at\`),
        CONSTRAINT \`CHK_public_booking_request_status\`
          CHECK (\`status\` IN ('confirmed','pending_approval','pending_payment','rejected','expired'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`public_booking_request\``);
    await queryRunner.query(`DROP TABLE \`company_booking_settings\``);
  }
}
