import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El correo de la compañía pasa a ser obligatorio.
 *
 * Deja de ser un dato de contacto opcional: es con el que se factura la
 * suscripción. Cobrix identifica al cliente por correo + cédula/RIF y sin él no
 * emite el documento de cobro (SUB-10), así que una compañía sin correo no
 * puede pagar por el carril automático.
 *
 * El alta ya lo manda —el registro copia el correo del dueño— y ahora los DTOs
 * lo exigen; esto cierra el círculo en la BD para que no vuelva a entrar una
 * fila sin él por otra vía.
 *
 * Las filas viejas se rellenan con el correo de la cuenta del dueño, que es de
 * donde salió el de todas las demás. Si queda alguna sin nada que copiar, la
 * migración FALLA a propósito con la consulta para encontrarlas: es preferible
 * a escribir un '' que después parece un correo y no lo es.
 */
export class CompanyEmailRequired1780000000064 implements MigrationInterface {
  name = 'CompanyEmailRequired1780000000064';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`company\` c
        JOIN \`user\` u ON u.\`id\` = c.\`user_id\`
      SET c.\`email\` = u.\`email\`
      WHERE (c.\`email\` IS NULL OR c.\`email\` = '')
        AND u.\`email\` IS NOT NULL AND u.\`email\` <> ''
    `);

    const pending = (await queryRunner.query(
      `SELECT COUNT(*) AS total FROM \`company\` WHERE \`email\` IS NULL OR \`email\` = ''`,
    )) as { total: number | string }[];
    const total = Number(pending[0]?.total ?? 0);
    if (total > 0) {
      throw new Error(
        `No se puede hacer obligatorio company.email: quedan ${total} compañía(s) sin correo y sin dueño del que copiarlo. ` +
          "Encuéntralas con: SELECT id, name, user_id FROM company WHERE email IS NULL OR email = ''; " +
          'cárgales un correo y vuelve a correr la migración.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE \`company\` MODIFY \`email\` varchar(145) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\` MODIFY \`email\` varchar(145) NULL`,
    );
  }
}
