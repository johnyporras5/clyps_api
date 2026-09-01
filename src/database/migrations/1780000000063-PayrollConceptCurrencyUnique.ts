import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago mixto (B): la comisión del ejecutor puede partirse en DOS conceptos del
 * mismo servicio/trabajador — una parte en efectivo (moneda del servicio) y el
 * resto en Bs. El único `(source_type, source_id, type, period_detail_id)` lo
 * impedía; se le agrega `currency` para que efectivo ($/€) y resto (VES) sean
 * distintos. Sigue dando idempotencia: reintentar el cobro no duplica.
 */
export class PayrollConceptCurrencyUnique1780000000063 implements MigrationInterface {
  name = 'PayrollConceptCurrencyUnique1780000000063';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_concept_source\` ON \`payroll_concept\``,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_concept_source\` ON \`payroll_concept\` (\`source_type\`, \`source_id\`, \`type\`, \`period_detail_id\`, \`currency\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_concept_source\` ON \`payroll_concept\``,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_concept_source\` ON \`payroll_concept\` (\`source_type\`, \`source_id\`, \`type\`, \`period_detail_id\`)`,
    );
  }
}
