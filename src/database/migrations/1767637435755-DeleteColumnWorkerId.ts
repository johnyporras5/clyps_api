import { MigrationInterface, QueryRunner } from "typeorm";

export class DeleteColumnWorkerId1767637435755 implements MigrationInterface {
    name = 'DeleteColumnWorkerId1767637435755'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` DROP FOREIGN KEY \`FK_53c0c60799b297b6bd29e87d6de\``);
        await queryRunner.query(`DROP INDEX \`IDX_53c0c60799b297b6bd29e87d6d\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`REL_53c0c60799b297b6bd29e87d6d\` ON \`user\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`worker_id\``);
        await queryRunner.query(`ALTER TABLE \`client\` ADD UNIQUE INDEX \`IDX_f18a6fabea7b2a90ab6bf10a65\` (\`user_id\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_f18a6fabea7b2a90ab6bf10a65\` ON \`client\` (\`user_id\`)`);
        await queryRunner.query(`ALTER TABLE \`client\` ADD CONSTRAINT \`FK_f18a6fabea7b2a90ab6bf10a650\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`client\` DROP FOREIGN KEY \`FK_f18a6fabea7b2a90ab6bf10a650\``);
        await queryRunner.query(`DROP INDEX \`REL_f18a6fabea7b2a90ab6bf10a65\` ON \`client\``);
        await queryRunner.query(`ALTER TABLE \`client\` DROP INDEX \`IDX_f18a6fabea7b2a90ab6bf10a65\``);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`worker_id\` int NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_53c0c60799b297b6bd29e87d6d\` ON \`user\` (\`worker_id\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_53c0c60799b297b6bd29e87d6d\` ON \`user\` (\`worker_id\`)`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD CONSTRAINT \`FK_53c0c60799b297b6bd29e87d6de\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
