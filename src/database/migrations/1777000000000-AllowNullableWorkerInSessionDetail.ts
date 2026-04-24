import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullableWorkerInSessionDetail1777000000000
  implements MigrationInterface {
  name = 'AllowNullableWorkerInSessionDetail1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dbName = (await queryRunner.query(`SELECT DATABASE() AS db`))[0].db;

    // Descubrir el nombre real del FK sobre session_detail.company_worker_id
    const fks: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'session_detail'
         AND COLUMN_NAME = 'company_worker_id'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName],
    );
    for (const fk of fks) {
      await queryRunner.query(
        `ALTER TABLE \`session_detail\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
      );
    }

    // Soltar cualquier índice residual sobre esa columna (MySQL deja uno con
    // el mismo nombre del FK por defecto para poder reconstruirlo).
    const idx: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'session_detail'
         AND COLUMN_NAME = 'company_worker_id'
         AND INDEX_NAME <> 'PRIMARY'`,
      [dbName],
    );
    for (const i of idx) {
      await queryRunner.query(
        `ALTER TABLE \`session_detail\` DROP INDEX \`${i.INDEX_NAME}\``,
      );
    }

    // MySQL con sql_require_primary_key=ON no permite DROP PRIMARY KEY en un
    // statement separado. Combinamos drop + add + change en un único ALTER
    // para que el servidor vea la tabla siempre con una PK válida.
    await queryRunner.query(
      `ALTER TABLE \`session_detail\`
         DROP PRIMARY KEY,
         ADD PRIMARY KEY (\`id\`, \`service_id\`, \`session_id\`),
         CHANGE \`company_worker_id\` \`company_worker_id\` int NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD CONSTRAINT \`fk_session_detail_company_worker1\` FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dbName = (await queryRunner.query(`SELECT DATABASE() AS db`))[0].db;

    const fks: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'session_detail'
         AND COLUMN_NAME = 'company_worker_id'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName],
    );
    for (const fk of fks) {
      await queryRunner.query(
        `ALTER TABLE \`session_detail\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
      );
    }

    await queryRunner.query(
      `UPDATE \`session_detail\` SET \`company_worker_id\` = 0 WHERE \`company_worker_id\` IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`session_detail\`
         DROP PRIMARY KEY,
         ADD PRIMARY KEY (\`id\`, \`service_id\`, \`company_worker_id\`, \`session_id\`),
         CHANGE \`company_worker_id\` \`company_worker_id\` int NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD CONSTRAINT \`fk_session_detail_company_worker1\` FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
