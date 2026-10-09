import { QueryRunner } from 'typeorm';
import { WorkerClientUserOptional1780000000072 } from './migrations/1780000000072-WorkerClientUserOptional';

/** QueryRunner falso: guarda el SQL y contesta según lo que se pregunte. */
function runner(answers: { hasIndex?: boolean; nulls?: [number, number] }) {
  const sql: string[] = [];
  const query = jest.fn((statement: string) => {
    sql.push(statement.replace(/\s+/g, ' ').trim());
    if (statement.includes('information_schema.STATISTICS')) {
      return Promise.resolve(answers.hasIndex ? [{ 1: 1 }] : []);
    }
    if (statement.includes('IS NULL')) {
      const [workers, clients] = answers.nulls ?? [0, 0];
      return Promise.resolve([
        { workers: String(workers), clients: String(clients) },
      ]);
    }
    return Promise.resolve([]);
  });
  return { qr: { query } as unknown as QueryRunner, sql };
}

describe('migración 072: user_id opcional', () => {
  const migration = new WorkerClientUserOptional1780000000072();

  it('sube: borra el índice duplicado y deja user_id en NULL', async () => {
    const { qr, sql } = runner({ hasIndex: true });
    await migration.up(qr);

    expect(sql).toContain(
      'DROP INDEX `IDX_ea2f25edbbd2a3030f7c526b29` ON `worker`',
    );
    expect(sql).toContain('ALTER TABLE `worker` MODIFY `user_id` int NULL');
    expect(sql).toContain('ALTER TABLE `client` MODIFY `user_id` int NULL');
  });

  it('si el índice duplicado ya no está, no falla', async () => {
    const { qr, sql } = runner({ hasIndex: false });
    await migration.up(qr);
    expect(sql.some((s) => s.startsWith('DROP INDEX'))).toBe(false);
  });

  it('no se deja revertir si ya hay gente sin usuario', async () => {
    const { qr, sql } = runner({ nulls: [0, 3] });
    await expect(migration.down(qr)).rejects.toThrow(
      'hay 0 trabajadores y 3 clientes sin usuario',
    );
    expect(sql.some((s) => s.includes('NOT NULL'))).toBe(false);
  });

  it('sin nadie en NULL, revierte todo', async () => {
    const { qr, sql } = runner({ nulls: [0, 0] });
    await migration.down(qr);
    expect(sql).toContain('ALTER TABLE `worker` MODIFY `user_id` int NOT NULL');
    expect(sql).toContain('ALTER TABLE `client` MODIFY `user_id` int NOT NULL');
  });
});
