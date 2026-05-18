import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCancellationReasonSession1780000000002 implements MigrationInterface {
    name = 'AddCancellationReasonSession1780000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Motivo de cancelación de la cita completa — lo registra el admin
        // o el cliente al cancelar la cita.
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`cancellation_reason\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`cancellation_reason\``);
    }

}
