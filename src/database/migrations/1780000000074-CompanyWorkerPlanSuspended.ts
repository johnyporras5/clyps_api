import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trabajador suspendido por el plan: `company_worker.plan_suspended`.
 *
 * Al terminar la prueba, un salón con más trabajadores de los que admite su
 * plan escoge con cuáles se queda; el resto queda suspendido. No se borra nada
 * y no se toca `is_active` (que es el login del trabajador): solo se impide
 * darle citas nuevas hasta que el salón pague el Full.
 *
 * Todos los que ya existen nacen sin suspender: nadie queda suspendido sin
 * haberlo escogido el dueño.
 */
export class CompanyWorkerPlanSuspended1780000000074 implements MigrationInterface {
  name = 'CompanyWorkerPlanSuspended1780000000074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\`
         ADD \`plan_suspended\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` DROP COLUMN \`plan_suspended\``,
    );
  }
}
