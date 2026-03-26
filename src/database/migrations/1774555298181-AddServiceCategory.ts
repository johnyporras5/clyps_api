import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceCategory1774555298181 implements MigrationInterface {
    name = 'AddServiceCategory1774555298181'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`service_feedback\` (\`id\` int NOT NULL AUTO_INCREMENT, \`stars\` int NULL, \`description\` text NULL, \`datetime\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`service_id\` int NOT NULL, \`client_id\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`service_feedback\` ADD CONSTRAINT \`FK_5a8acb9e7aec6dbf2dfb5c058ad\` FOREIGN KEY (\`service_id\`) REFERENCES \`service\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_feedback\` DROP FOREIGN KEY \`FK_5a8acb9e7aec6dbf2dfb5c058ad\``);
        await queryRunner.query(`DROP TABLE \`service_feedback\``);
    }

}
