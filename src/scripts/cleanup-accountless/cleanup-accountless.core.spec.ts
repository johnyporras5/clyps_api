import {
  Candidate,
  SqlRunner,
  assertCanApply,
  classify,
  cleanCandidate,
  countByCompany,
  parseArgs,
  parseCompanyIds,
  toCsv,
} from './cleanup-accountless.core';

const MARTA: Candidate = {
  kind: 'client',
  profileId: 3,
  userId: 90,
  username: 'marta',
  companyIds: [1],
};
const LUIS: Candidate = {
  kind: 'worker',
  profileId: 4,
  userId: 91,
  username: 'luis',
  companyIds: [1, 41],
};

/** Runner falso: guarda el SQL y contesta las filas afectadas que se le digan. */
function runner(affected: number[] = []) {
  const sql: { statement: string; params?: unknown[] }[] = [];
  let i = 0;
  const fake: SqlRunner = {
    query: (statement, params) => {
      sql.push({ statement, params });
      const n =
        statement.startsWith('UPDATE') || statement.startsWith('DELETE')
          ? (affected[i++] ?? 1)
          : 0;
      return Promise.resolve({ affectedRows: n });
    },
  };
  return { fake, sql };
}

describe('protecciones antes de aplicar', () => {
  it('sin --apply solo mira, aunque falte la lista de excluidos', () => {
    expect(() => assertCanApply(parseArgs([]), [])).not.toThrow();
  });

  it('con --apply y sin salones excluidos se niega (limpiaría también a esos)', () => {
    expect(() => assertCanApply(parseArgs(['--apply']), [])).toThrow(
      'LEGACY_IDENTITY_COMPANY_IDS está vacía',
    );
  });

  it('con la lista puesta, aplica', () => {
    expect(() =>
      assertCanApply(parseArgs(['--apply']), [27, 31]),
    ).not.toThrow();
  });

  it('sin excluidos solo si se pide a propósito con --no-legacy', () => {
    expect(() =>
      assertCanApply(parseArgs(['--apply', '--no-legacy']), []),
    ).not.toThrow();
  });
});

describe('quién se limpia y quién no', () => {
  it('no toca a nadie que esté en un salón excluido, aunque vaya también a uno normal', () => {
    const plan = classify([MARTA, LUIS], [41], new Map());

    expect(plan.clean).toEqual([MARTA]);
    expect(plan.skipped).toEqual([
      {
        candidate: LUIS,
        reason: 'legacy_company',
        detail: 'salón excluido 41',
      },
    ]);
  });

  it('no toca a quien tenga algo enlazado a su cuenta', () => {
    const refs = new Map([[90, ['notifications.user_id']]]);
    const plan = classify([MARTA], [], refs);

    expect(plan.clean).toEqual([]);
    expect(plan.skipped[0]).toMatchObject({
      reason: 'has_references',
      detail: 'notifications.user_id',
    });
  });

  it('el resto sí se limpia', () => {
    expect(classify([MARTA, LUIS], [27], new Map()).clean).toEqual([
      MARTA,
      LUIS,
    ]);
  });
});

describe('limpiar una ficha', () => {
  it('cliente: primero suelta la ficha, después borra la cuenta (por el CASCADE)', async () => {
    const { fake, sql } = runner();
    await expect(cleanCandidate(fake, MARTA)).resolves.toBe(true);

    expect(sql.map((s) => s.statement)).toEqual([
      'UPDATE `client` SET `user_id` = NULL WHERE `id` = ? AND `user_id` = ?',
      'DELETE FROM `user_verification_codes` WHERE `user_id` = ?',
      'DELETE FROM `user` WHERE `id` = ? AND `last_login` IS NULL',
    ]);
    expect(sql[0].params).toEqual([3, 90]);
  });

  it('trabajador: suelta también sus company_worker', async () => {
    const { fake, sql } = runner();
    await cleanCandidate(fake, LUIS);

    expect(sql.map((s) => s.statement)).toEqual([
      'UPDATE `worker` SET `user_id` = NULL WHERE `id` = ? AND `user_id` = ?',
      'UPDATE `company_worker` SET `user_id` = NULL WHERE `user_id` = ?',
      'DELETE FROM `user_verification_codes` WHERE `user_id` = ?',
      'DELETE FROM `user` WHERE `id` = ? AND `last_login` IS NULL',
    ]);
  });

  it('si la ficha ya no apunta a esa cuenta, no borra nada', async () => {
    const { fake, sql } = runner([0]);
    await expect(cleanCandidate(fake, MARTA)).resolves.toBe(false);
    expect(sql).toHaveLength(1);
  });

  it('si inició sesión justo ahora, falla para que la transacción deshaga', async () => {
    // suelta la ficha (1), borra códigos (1), pero el user ya no cumple (0)
    const { fake } = runner([1, 1, 0]);
    await expect(cleanCandidate(fake, MARTA)).rejects.toThrow(
      'cambió durante la limpieza',
    );
  });
});

describe('utilidades', () => {
  it('lee los salones del JSON de MySQL venga como venga', () => {
    expect(parseCompanyIds('[27, 31]')).toEqual([27, 31]);
    expect(parseCompanyIds([1, '41'])).toEqual([1, 41]);
    expect(parseCompanyIds(null)).toEqual([]);
    expect(parseCompanyIds('no es json')).toEqual([]);
  });

  it('cuenta por salón, para revisar antes de aplicar', () => {
    const counts = countByCompany([MARTA, LUIS, { ...MARTA, companyIds: [] }]);
    expect(Object.fromEntries(counts)).toEqual({
      1: 2,
      41: 1,
      'sin salón': 1,
    });
  });

  it('el CSV guarda lo necesario para rehacer las cuentas', () => {
    expect(toCsv([LUIS])).toBe(
      'kind,profile_id,user_id,username,company_ids\n' +
        '"worker","4","91","luis","1 41"\n',
    );
  });
});
