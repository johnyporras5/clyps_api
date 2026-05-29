import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsOffer1772562214783 implements MigrationInterface {
  name = 'AddFieldsOffer1772562214783';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD \`offer_id\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`offer_id\``);
  }
}
