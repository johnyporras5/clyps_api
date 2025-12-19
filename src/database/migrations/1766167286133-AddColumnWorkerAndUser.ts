import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnWorkerAndUser1766167286133 implements MigrationInterface {
    name = 'AddColumnWorkerAndUser1766167286133'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker\` ADD \`user_id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`worker\` ADD UNIQUE INDEX \`IDX_ea2f25edbbd2a3030f7c526b29\` (\`user_id\`)`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`worker_id\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD UNIQUE INDEX \`IDX_53c0c60799b297b6bd29e87d6d\` (\`worker_id\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_ea2f25edbbd2a3030f7c526b29\` ON \`worker\` (\`user_id\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_53c0c60799b297b6bd29e87d6d\` ON \`user\` (\`worker_id\`)`);
        await queryRunner.query(`ALTER TABLE \`worker\` ADD CONSTRAINT \`FK_ea2f25edbbd2a3030f7c526b297\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD CONSTRAINT \`FK_53c0c60799b297b6bd29e87d6de\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` DROP FOREIGN KEY \`FK_53c0c60799b297b6bd29e87d6de\``);
        await queryRunner.query(`ALTER TABLE \`worker\` DROP FOREIGN KEY \`FK_ea2f25edbbd2a3030f7c526b297\``);
        await queryRunner.query(`DROP INDEX \`REL_53c0c60799b297b6bd29e87d6d\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`REL_ea2f25edbbd2a3030f7c526b29\` ON \`worker\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP INDEX \`IDX_53c0c60799b297b6bd29e87d6d\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`worker_id\``);
        await queryRunner.query(`ALTER TABLE \`worker\` DROP INDEX \`IDX_ea2f25edbbd2a3030f7c526b29\``);
        await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`user_id\``);
    }

}
