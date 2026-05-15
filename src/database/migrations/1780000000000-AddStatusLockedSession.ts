import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatusLockedSession1780000000000 implements MigrationInterface {
    name = 'AddStatusLockedSession1780000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Marca que el admin tomó el control del estado de la cita.
        // Mientras está en 1, los trabajadores no pueden cambiar sus detalles
        // y el auto-sync no recalcula el estado de la cita.
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`status_locked\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`status_locked\``);
    }

}
