import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIAPROMP1770927011615 implements MigrationInterface {
  name = 'AddIAPROMP1770927011615';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`ia_prompts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`text\` text NOT NULL, \`tipo\` varchar(1) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`ia_prompts\``);
  }
}
