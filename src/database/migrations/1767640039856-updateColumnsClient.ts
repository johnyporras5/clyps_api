import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateColumnsClient1767640039856 implements MigrationInterface {
    name = 'UpdateColumnsClient1767640039856'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`client\` CHANGE \`phone_number\` \`phone\` varchar(20) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`client\` CHANGE \`phone\` \`phone_number\` varchar(20) NULL`);
    }

}
