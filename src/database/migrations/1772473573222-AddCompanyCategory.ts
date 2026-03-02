import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyCategory1772473573222 implements MigrationInterface {
    name = 'AddCompanyCategory1772473573222'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`company_category\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(145) NOT NULL, \`company_id\` int NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`company_category\` ADD CONSTRAINT \`FK_4ee20f3137301088c0475f1f826\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company_category\` DROP FOREIGN KEY \`FK_4ee20f3137301088c0475f1f826\``);
        await queryRunner.query(`DROP TABLE \`company_category\``);
    }

}
