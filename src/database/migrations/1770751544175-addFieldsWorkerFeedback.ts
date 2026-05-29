import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsWorkerFeedback1770751544175 implements MigrationInterface {
  name = 'AddFieldsWorkerFeedback1770751544175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP FOREIGN KEY \`FK_7a6d163348edf89f3adb0aa48c5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP COLUMN \`workerId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD \`description\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP COLUMN \`datetime\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD \`datetime\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD CONSTRAINT \`FK_36986eaf5271a4b8b734ab07b24\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP FOREIGN KEY \`FK_36986eaf5271a4b8b734ab07b24\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP COLUMN \`datetime\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD \`datetime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` DROP COLUMN \`description\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD \`workerId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker_feedback\` ADD CONSTRAINT \`FK_7a6d163348edf89f3adb0aa48c5\` FOREIGN KEY (\`workerId\`) REFERENCES \`worker\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
