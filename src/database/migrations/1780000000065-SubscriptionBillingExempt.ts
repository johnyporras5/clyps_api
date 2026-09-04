import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Salones exentos de cobro (cortesía, socios, el salón demo).
 *
 * Sin esta marca la única forma de tenerlos era ponerles un `current_period_end`
 * lejano: quedaban indistinguibles de un cliente que paga —salían en la cola de
 * cobro y en los recordatorios— y el cron de vencimientos los bloquearía en
 * cuanto exista, porque para él solo sería una fecha más.
 *
 * La marca NO regala funciones: el exento conserva SU plan (un exento en Básico
 * sigue sin IA). Lo único que se le perdona es pagar.
 */
export class SubscriptionBillingExempt1780000000065 implements MigrationInterface {
  name = 'SubscriptionBillingExempt1780000000065';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`subscription\`
         ADD COLUMN \`billing_exempt\` tinyint NOT NULL DEFAULT 0
         COMMENT 'No se le cobra: acceso permanente con su plan, sin vencimiento ni bloqueo'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`subscription\` DROP COLUMN \`billing_exempt\``,
    );
  }
}
