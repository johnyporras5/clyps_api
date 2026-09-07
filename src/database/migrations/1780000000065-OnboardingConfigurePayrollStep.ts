import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-372: agrega el paso `configure_payroll` (CLYP-370) al estado de onboarding
 * de los tenants EXISTENTES, sin reabrir onboardings ya completados ni bajar
 * ningún `global_status`.
 *
 * - Onboarding COMPLETADO (viejo de 5 pasos): el paso se marca `completed` para
 *   no dejarlo en 5/6 ni reabrir nada. No aplica bloqueo alguno.
 * - Onboarding EN CURSO / SKIPPED: `completed` si el tenant ya tiene nómina
 *   (existe `payroll_config` o `payroll_period` — ya operaba), si no `pending`
 *   (verá el paso pendiente antes de su primera cita).
 *
 * Solo toca filas donde el paso aún no existe (idempotente). El estado nuevo de
 * cada company se sigue recalculando en runtime (`normalizeSteps` + los hooks);
 * esto es solo el bootstrap para no dejar a nadie en un estado raro.
 */
export class OnboardingConfigurePayrollStep1780000000065 implements MigrationInterface {
  name = 'OnboardingConfigurePayrollStep1780000000065';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Completados: satisfacer el paso, nunca reabrir.
    await queryRunner.query(`
      UPDATE \`onboarding_state\`
      SET \`steps\` = JSON_SET(
        \`steps\`, '$.configure_payroll',
        JSON_OBJECT(
          'status', 'completed',
          'updatedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
        )
      )
      WHERE \`global_status\` = 'completed'
        AND (
          JSON_EXTRACT(\`steps\`, '$.configure_payroll') IS NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(\`steps\`, '$.configure_payroll.status'))
             <> 'completed'
        )
    `);

    // En curso / skipped: completed si ya tienen nómina, si no pending.
    await queryRunner.query(`
      UPDATE \`onboarding_state\` os
      SET os.\`steps\` = JSON_SET(
        os.\`steps\`, '$.configure_payroll',
        JSON_OBJECT(
          'status',
          CASE WHEN EXISTS(
                 SELECT 1 FROM \`payroll_config\` pc WHERE pc.\`company_id\` = os.\`company_id\`
               )
               OR EXISTS(
                 SELECT 1 FROM \`payroll_period\` pp WHERE pp.\`company_id\` = os.\`company_id\`
               )
               THEN 'completed' ELSE 'pending' END,
          'updatedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
        )
      )
      WHERE os.\`global_status\` <> 'completed'
        AND (
          JSON_EXTRACT(os.\`steps\`, '$.configure_payroll') IS NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(os.\`steps\`, '$.configure_payroll.status'))
             <> 'completed'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`onboarding_state\`
      SET \`steps\` = JSON_REMOVE(\`steps\`, '$.configure_payroll')
      WHERE JSON_EXTRACT(\`steps\`, '$.configure_payroll') IS NOT NULL
    `);
  }
}
