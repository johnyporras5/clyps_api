import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomInt } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Código visual de las citas: agrega `session.public_code` (opaco, no
 * secuencial, base32 sin ambiguos, ej. `7HE8CN`) SOLO para mostrar en vez del
 * `id` interno.
 * Los enlaces/rutas siguen usando `id`. Aditiva y segura para prod:
 *   1. agrega la columna nullable,
 *   2. backfill de las filas existentes con códigos únicos,
 *   3. índice UNIQUE como respaldo.
 */
export class AddSessionPublicCode1780000000041 implements MigrationInterface {
  name = 'AddSessionPublicCode1780000000041';

  private gen(): string {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
    return code;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD COLUMN \`public_code\` varchar(16) NULL`,
    );

    // Backfill: un código único por sesión existente.
    const rows: { id: number }[] = await queryRunner.query(
      `SELECT id FROM \`session\` WHERE \`public_code\` IS NULL`,
    );
    const used = new Set<string>();
    for (const row of rows) {
      let code = this.gen();
      while (used.has(code)) code = this.gen();
      used.add(code);
      await queryRunner.query(
        `UPDATE \`session\` SET \`public_code\` = ? WHERE id = ?`,
        [code, row.id],
      );
    }

    await queryRunner.query(
      `ALTER TABLE \`session\` ADD UNIQUE INDEX \`UQ_session_public_code\` (\`public_code\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP INDEX \`UQ_session_public_code\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP COLUMN \`public_code\``,
    );
  }
}
