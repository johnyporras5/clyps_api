import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicBookingIdentification1780000000080 implements MigrationInterface {
  name = 'PublicBookingIdentification1780000000080';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`public_booking_request\`
        ADD COLUMN \`guest_identification\` varchar(20) NULL AFTER \`guest_phone\`,
        ADD COLUMN \`is_new_account\` tinyint NOT NULL DEFAULT 0 AFTER \`guest_identification\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`public_booking_request\`
        DROP COLUMN \`is_new_account\`,
        DROP COLUMN \`guest_identification\`
    `);
  }
}
