import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-4: el anti-spam del rescate pasa a ser por canal.
 *
 * Desde los 4 días sin avanzar salen DOS avisos por el mismo (company, paso,
 * nivel): la fila del digest al consultor y el correo de acompañamiento al
 * dueño. Con el UNIQUE viejo el segundo nunca se podía reclamar, y soltar el
 * reclamo de uno (porque su envío falló) habría borrado también el del otro.
 *
 * Es UN solo ALTER a propósito: el índice también sostiene la FK de
 * `company_id`, y MySQL no deja quitarlo si no entra otro en la misma sentencia.
 */
export class RescueNotificationPerChannel1780000000075 implements MigrationInterface {
  name = 'RescueNotificationPerChannel1780000000075';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`onboarding_rescue_notification\`
         DROP INDEX \`UQ_rescue_company_step_level\`,
         ADD UNIQUE INDEX \`UQ_rescue_company_step_level_channel\` (\`company_id\`, \`step\`, \`level\`, \`channel\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los correos al dueño no caben en el índice viejo: se pierde su registro.
    await queryRunner.query(
      `DELETE FROM \`onboarding_rescue_notification\` WHERE \`channel\` = 'owner_email'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`onboarding_rescue_notification\`
         DROP INDEX \`UQ_rescue_company_step_level_channel\`,
         ADD UNIQUE INDEX \`UQ_rescue_company_step_level\` (\`company_id\`, \`step\`, \`level\`)`,
    );
  }
}
