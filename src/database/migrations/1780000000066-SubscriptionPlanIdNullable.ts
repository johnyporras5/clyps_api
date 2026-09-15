import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `plan_id` pasa a admitir NULL: el salón que se registra todavía no eligió
 * plan (CLYP-332).
 *
 * El registro no pide plan ni tarjeta, así que guardar 'full' en la fila era
 * decir algo que el dueño nunca dijo. NULL significa exactamente lo que pasa:
 * no ha elegido. Lo que usa durante los 15 días (el Full) lo resuelve
 * `effectivePlanId` a partir del estado, no de la columna.
 *
 * Las pruebas ya creadas se llevan a NULL: nacieron con 'full' por el mismo
 * registro automático, no por una elección. Las suscripciones que pagaron
 * conservan su plan — ese sí lo eligieron.
 */
export class SubscriptionPlanIdNullable1780000000066 implements MigrationInterface {
  name = 'SubscriptionPlanIdNullable1780000000066';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`subscription\`
         MODIFY COLUMN \`plan_id\` varchar(20) NULL
         COMMENT 'Plan elegido; NULL mientras el dueño no haya pagado ninguno'`,
    );
    await queryRunner.query(
      `UPDATE \`subscription\`
          SET \`plan_id\` = NULL
        WHERE \`status\` = 'trialing'
          AND \`current_period_end\` IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver a NOT NULL exige rellenar los NULL primero: se les devuelve el
    // plan de la prueba, que es lo que había antes de esta migración.
    await queryRunner.query(
      `UPDATE \`subscription\` SET \`plan_id\` = 'full' WHERE \`plan_id\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription\`
         MODIFY COLUMN \`plan_id\` varchar(20) NOT NULL`,
    );
  }
}
