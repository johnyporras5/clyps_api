import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClientNotes1780000000013 implements MigrationInterface {
  name = 'CreateClientNotes1780000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Notas (calificación de texto) de admins sobre clientes. Una nota por
    // (cliente, admin autor). Todos los admin las leen; sólo el autor edita.
    await queryRunner.query(`
      CREATE TABLE \`client_note\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int NOT NULL,
        \`created_by_user_id\` int NOT NULL,
        \`company_id\` int NULL,
        \`note\` text NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_client_note_client_author\` (\`client_id\`, \`created_by_user_id\`),
        INDEX \`IDX_client_note_client\` (\`client_id\`),
        CONSTRAINT \`FK_client_note_client\` FOREIGN KEY (\`client_id\`)
          REFERENCES \`client\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `client_note`');
  }
}
