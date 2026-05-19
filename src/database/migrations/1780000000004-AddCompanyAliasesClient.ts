import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyAliasesClient1780000000004 implements MigrationInterface {
    name = 'AddCompanyAliasesClient1780000000004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Alias del cliente por compañía: array JSON [{ companyId, alias }].
        // Cada compañía guarda su propio alias sin pisar el de las demás.
        await queryRunner.query(`ALTER TABLE \`client\` ADD \`company_aliases\` json NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`company_aliases\``);
    }

}
