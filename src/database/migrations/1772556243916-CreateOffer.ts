import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOffer1772556243916 implements MigrationInterface {
    name = 'CreateOffer1772556243916'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`offer\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`logo\` varchar(500) NULL, \`description\` text NULL, \`status\` tinyint NOT NULL DEFAULT '1', \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`company_id\` int NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`service_offer\` (\`id\` int NOT NULL AUTO_INCREMENT, \`service_id\` int NOT NULL, \`offer_id\` int NOT NULL, \`price\` decimal(10,2) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`offer\` ADD CONSTRAINT \`FK_7d1cbe435c8a0ff1e35adca2832\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`service_offer\` ADD CONSTRAINT \`FK_98cc54c8205fe7b5cd3aef4b181\` FOREIGN KEY (\`service_id\`) REFERENCES \`service\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`service_offer\` ADD CONSTRAINT \`FK_32a15e610b861a44e3e72c01db8\` FOREIGN KEY (\`offer_id\`) REFERENCES \`offer\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_offer\` DROP FOREIGN KEY \`FK_32a15e610b861a44e3e72c01db8\``);
        await queryRunner.query(`ALTER TABLE \`service_offer\` DROP FOREIGN KEY \`FK_98cc54c8205fe7b5cd3aef4b181\``);
        await queryRunner.query(`ALTER TABLE \`offer\` DROP FOREIGN KEY \`FK_7d1cbe435c8a0ff1e35adca2832\``);
        await queryRunner.query(`DROP TABLE \`service_offer\``);
        await queryRunner.query(`DROP TABLE \`offer\``);
    }

}
