import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCancelledBySession1780000000003 implements MigrationInterface {
    name = 'AddCancelledBySession1780000000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Identifica quién canceló la cita / el servicio:
        // 'adm' = administrador, 'cli' = cliente, 'wrk' = trabajador,
        // 'system' = auto-cancelación por cita vencida.
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`cancelled_by\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`cancelled_by\` varchar(20) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`cancelled_by\``);
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`cancelled_by\``);
    }

}
