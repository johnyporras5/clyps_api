import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceCategory1771460721072 implements MigrationInterface {
    name = 'AddServiceCategory1771460721072'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`service_category\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(145) NOT NULL, \`company_id\` int NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD \`category_id\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD CONSTRAINT \`FK_9d513b39d251063f98f2a7b941d\` FOREIGN KEY (\`category_id\`) REFERENCES \`service_category\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`service_category\` ADD CONSTRAINT \`FK_5015996724351d05c61ea6b2faf\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` DROP FOREIGN KEY \`FK_5015996724351d05c61ea6b2faf\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP FOREIGN KEY \`FK_9d513b39d251063f98f2a7b941d\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`category_id\``);
        await queryRunner.query(`DROP TABLE \`service_category\``);
    }

}
