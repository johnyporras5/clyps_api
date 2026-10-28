import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebHandoffTicket1780000000077 implements MigrationInterface {
  name = 'CreateWebHandoffTicket1780000000077';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`web_handoff_ticket\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`ticket_hash\` varchar(64) NOT NULL,
        \`expires_at\` datetime NOT NULL,
        \`used_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_web_handoff_ticket_hash\` (\`ticket_hash\`),
        KEY \`IDX_web_handoff_ticket_user\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`web_handoff_ticket\``);
  }
}
