import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyFirstAppointmentsClient1780000000008
  implements MigrationInterface
{
  name = 'AddCompanyFirstAppointmentsClient1780000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fecha de la primera cita del cliente por compañía:
    // array JSON [{ companyId, firstAppointmentDate }].
    // Se registra al crear la primera sesión/cita del cliente con esa compañía.
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`company_first_appointments\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`company_first_appointments\``,
    );
  }
}
