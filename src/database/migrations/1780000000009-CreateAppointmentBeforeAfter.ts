import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppointmentBeforeAfter1780000000009 implements MigrationInterface {
  name = 'CreateAppointmentBeforeAfter1780000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`appointment_before_after\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`session_id\` int NOT NULL,
        \`before_picture\` varchar(255) NULL,
        \`before_uploaded_at\` datetime NULL,
        \`before_uploaded_by_id\` int NULL,
        \`before_uploaded_by_name\` varchar(145) NULL,
        \`after_picture\` varchar(255) NULL,
        \`after_uploaded_at\` datetime NULL,
        \`after_uploaded_by_id\` int NULL,
        \`after_uploaded_by_name\` varchar(145) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_appointment_before_after_session\` (\`session_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `appointment_before_after`');
  }
}
