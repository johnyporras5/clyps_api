import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `worker.user_id` y `client.user_id` pasan a aceptar NULL: un trabajador o un
 * cliente sin correo no tiene cuenta, y la cuenta (`user`) se crea recién
 * cuando se le asigna uno.
 *
 * La migración no vacía ninguno: solo lo permite. La llave foránea con
 * ON DELETE CASCADE y el índice único se quedan; MySQL admite varios NULL en
 * un índice único, así que no chocan entre sí.
 *
 * De paso se borra `IDX_ea2f25edbbd2a3030f7c526b29`, un índice único de
 * `worker.user_id` que quedó duplicado de migraciones viejas: lo cubre
 * `REL_ea2f25edbbd2a3030f7c526b29`, que es el que usa la relación.
 */
export class WorkerClientUserOptional1780000000072 implements MigrationInterface {
  name = 'WorkerClientUserOptional1780000000072';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'IDX_ea2f25edbbd2a3030f7c526b29')) {
      await queryRunner.query(
        `DROP INDEX \`IDX_ea2f25edbbd2a3030f7c526b29\` ON \`worker\``,
      );
    }
    await queryRunner.query(
      `ALTER TABLE \`worker\` MODIFY \`user_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` MODIFY \`user_id\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver a NOT NULL con filas en NULL fallaría a mitad de camino: se
    // frena antes, diciendo qué hay que resolver.
    const [{ workers, clients }] = (await queryRunner.query(
      `SELECT
         (SELECT COUNT(*) FROM \`worker\` WHERE \`user_id\` IS NULL) AS workers,
         (SELECT COUNT(*) FROM \`client\` WHERE \`user_id\` IS NULL) AS clients`,
    )) as { workers: string; clients: string }[];
    if (Number(workers) > 0 || Number(clients) > 0) {
      throw new Error(
        `No se puede revertir: hay ${workers} trabajadores y ${clients} clientes sin usuario. ` +
          'Hay que crearles su fila en `user` (o borrarlos) antes de volver a NOT NULL.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE \`client\` MODIFY \`user_id\` int NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker\` MODIFY \`user_id\` int NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_ea2f25edbbd2a3030f7c526b29\` ON \`worker\` (\`user_id\`)`,
    );
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    name: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'worker' AND INDEX_NAME = ?
        LIMIT 1`,
      [name],
    )) as unknown[];
    return rows.length > 0;
  }
}
