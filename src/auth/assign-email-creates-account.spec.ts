jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './types/authenticated-request';
import { Worker } from '../worker/entities/worker.entity';
import { Client } from '../client/entities/client.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { User } from '../user/entities/user.entity';

/**
 * Subtarea 5: asignarle un correo a un trabajador o cliente que se dio de
 * alta SIN correo le crea la cuenta (`user`), la enlaza y le manda el acceso.
 */

const COMPANY = { id: 41, name: 'Prueba1', userId: 1 };
const CALLER = { sub: 1, userType: 'adm' } as unknown as AuthenticatedUser;

type Row = Record<string, unknown>;

function fakeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn((row: Row) => Promise.resolve({ id: 500, ...row })),
    create: jest.fn((row: Row) => ({ ...row })),
  };
}

function setup(profile: {
  worker?: Row;
  client?: Row;
  /** Lo que ve la transacción al releer la ficha bloqueada. */
  lockedUserId?: number | null;
}) {
  // Repositorios de afuera (los del servicio).
  const users = fakeRepo();
  const workers = fakeRepo();
  const clients = fakeRepo();
  const companyWorkers = fakeRepo();
  const companies = fakeRepo();
  companies.findOne.mockResolvedValue(COMPANY);
  workers.findOne.mockResolvedValue(profile.worker ?? null);
  clients.findOne.mockResolvedValue(profile.client ?? null);
  companyWorkers.findOne.mockResolvedValue({ id: 7, workerId: 3 });

  // Repositorios de adentro de la transacción.
  const tx = {
    users: fakeRepo(),
    workers: fakeRepo(),
    clients: fakeRepo(),
    companyWorkers: fakeRepo(),
  };
  const locked = { id: 3, userId: profile.lockedUserId ?? null };
  tx.workers.findOne.mockResolvedValue(locked);
  tx.clients.findOne.mockResolvedValue(locked);

  const em = {
    getRepository: (entity: unknown) =>
      entity === User
        ? tx.users
        : entity === Worker
          ? tx.workers
          : entity === Client
            ? tx.clients
            : entity === CompanyWorker
              ? tx.companyWorkers
              : undefined,
  };
  const transaction = jest.fn((work: (e: typeof em) => Promise<unknown>) =>
    work(em),
  );
  Object.assign(users, { manager: { transaction } });

  const email = {
    sendWorkerCredentials: jest.fn().mockResolvedValue(true),
    sendClientCredentials: jest.fn().mockResolvedValue(true),
  };
  const trySendVerificationCode = jest.fn();

  const service = Object.create(AuthService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    userRepository: users,
    workerRepository: workers,
    clientRepository: clients,
    companyRepository: companies,
    companyWorkerRepository: companyWorkers,
    emailService: email,
    trySendVerificationCode,
  });

  return {
    auth: service as unknown as AuthService,
    users,
    tx,
    transaction,
    email,
    trySendVerificationCode,
  };
}

const LUIS = { id: 3, name: 'Luis Pérez', user: null };

describe('asignar correo a un trabajador sin cuenta', () => {
  it('crea su cuenta, la enlaza en worker y company_worker, y le manda el acceso', async () => {
    const { auth, tx, email, trySendVerificationCode } = setup({
      worker: LUIS,
    });

    const result = await auth.assignWorkerEmail(
      3,
      { email: '  Luis@X.com ' },
      CALLER,
    );

    const created = tx.users.save.mock.calls[0][0];
    expect(created).toMatchObject({
      email: 'luis@x.com',
      userType: 'wrk',
      emailVerified: 0,
    });
    expect(created.username).toMatch(/^luisperez\d{4}$/);

    expect(tx.workers.update).toHaveBeenCalledWith(3, { userId: 500 });
    expect(tx.companyWorkers.update).toHaveBeenCalledWith(
      { workerId: 3 },
      { userId: 500 },
    );

    expect(email.sendWorkerCredentials).toHaveBeenCalledWith(
      'luis@x.com',
      created.username,
      expect.any(String),
      'Prueba1',
    );
    // Se guarda el hash, nunca la contraseña que viaja por correo.
    const [[, , sentPassword]] = email.sendWorkerCredentials.mock
      .calls as unknown as [string, string, string, string][];
    expect(created.password).not.toBe(sentPassword);
    expect(created.password).toMatch(/^\$2[aby]\$/); // formato de bcrypt

    expect(trySendVerificationCode).toHaveBeenCalledWith('luis@x.com');
    expect(result).toMatchObject({ workerId: 3, credentialsSent: true });
  });

  it('si el correo ya es de otra cuenta: 409 y ni abre la transacción', async () => {
    const { auth, users, transaction, email } = setup({ worker: LUIS });
    users.findOne.mockResolvedValue({ id: 77, email: 'luis@x.com' });

    const error = await auth
      .assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER)
      .catch((e: unknown) => e);

    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(email.sendWorkerCredentials).not.toHaveBeenCalled();
  });

  it('si otra cuenta tomó el correo mientras tanto: 409 dentro, sin crear nada', async () => {
    const { auth, tx, email } = setup({ worker: LUIS });
    tx.users.findOne.mockResolvedValue({ id: 77, email: 'luis@x.com' });

    await expect(
      auth.assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.users.save).not.toHaveBeenCalled();
    expect(email.sendWorkerCredentials).not.toHaveBeenCalled();
  });

  it('dos clics a la vez: el segundo ve la cuenta ya creada y responde 409', async () => {
    const { auth, tx } = setup({ worker: LUIS, lockedUserId: 500 });

    const error = await auth
      .assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER)
      .catch((e: unknown) => e);

    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ACCESS_ALREADY_GRANTED',
    });
    expect(tx.users.save).not.toHaveBeenCalled();
  });

  it('la ficha se lee bloqueada (FOR UPDATE) dentro de la transacción', async () => {
    const { auth, tx } = setup({ worker: LUIS });
    await auth.assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER);
    expect(tx.workers.findOne).toHaveBeenCalledWith({
      where: { id: 3 },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('si falla el enlace, el error sube (la transacción deshace) y no se envía nada', async () => {
    const { auth, tx, email } = setup({ worker: LUIS });
    tx.companyWorkers.update.mockRejectedValue(new Error('se cayó la base'));

    await expect(
      auth.assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER),
    ).rejects.toThrow('se cayó la base');
    expect(email.sendWorkerCredentials).not.toHaveBeenCalled();
  });

  it('si el correo no sale, la cuenta queda creada y la respuesta lo dice', async () => {
    const { auth, tx, email } = setup({ worker: LUIS });
    email.sendWorkerCredentials.mockResolvedValue(false);

    const result = await auth.assignWorkerEmail(
      3,
      { email: 'luis@x.com' },
      CALLER,
    );

    expect(tx.users.save).toHaveBeenCalled();
    expect(result).toMatchObject({ credentialsSent: false });
  });

  it('con cuenta ya creada (sin verificar): igual que antes, sin transacción', async () => {
    const existing = {
      id: 90,
      username: 'luis',
      email: 'luis@x.com',
      emailVerified: 0,
    };
    const { auth, users, transaction, email } = setup({
      worker: { id: 3, name: 'Luis', user: existing },
    });

    await auth.assignWorkerEmail(3, { email: 'luis@x.com' }, CALLER);

    expect(transaction).not.toHaveBeenCalled();
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 90, email: 'luis@x.com' }),
    );
    expect(email.sendWorkerCredentials).toHaveBeenCalledWith(
      'luis@x.com',
      'luis',
      expect.any(String),
      'Prueba1',
    );
  });
});

describe('asignar correo a un cliente sin cuenta', () => {
  const MARTA = {
    id: 3,
    name: 'Marta',
    lastName: 'Gil',
    companies: [41],
    user: null,
  };

  it('crea su cuenta de cliente y la enlaza, con el correo también en la ficha', async () => {
    const { auth, tx, email } = setup({ client: MARTA });

    const result = await auth.assignClientEmail(
      3,
      { email: 'marta@x.com' },
      CALLER,
    );

    const created = tx.users.save.mock.calls[0][0];
    expect(created).toMatchObject({ email: 'marta@x.com', userType: 'cli' });
    expect(created.username).toMatch(/^martagil\d{4}$/);
    expect(tx.clients.update).toHaveBeenCalledWith(3, {
      userId: 500,
      email: 'marta@x.com',
    });
    expect(email.sendClientCredentials).toHaveBeenCalledWith(
      'marta@x.com',
      created.username,
      expect.any(String),
    );
    expect(result).toMatchObject({ clientId: 3, credentialsSent: true });
  });

  it('de otro salón: 403 y no se toca nada', async () => {
    const { auth, transaction } = setup({
      client: { ...MARTA, companies: [9] },
    });
    await expect(
      auth.assignClientEmail(3, { email: 'marta@x.com' }, CALLER),
    ).rejects.toThrow('Este cliente no pertenece a tu negocio');
    expect(transaction).not.toHaveBeenCalled();
  });
});
