jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
// La regla de cédula repetida tiene sus propias pruebas; aquí no interesa.
jest.mock('../common/utils/identification-conflict.util', () => ({
  assertWorkerIdentificationFree: jest.fn(),
  assertClientIdentificationFree: jest.fn(),
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { RegisterClientByAdminDto } from './dto/register-client-by-admin.dto';
import { AuthenticatedUser } from './types/authenticated-request';

/**
 * Alta por el salón SIN correo (subtarea 4): solo se crea la ficha
 * (`worker` / `client`), sin fila en `user`. La cédula pasa a ser lo que
 * identifica a la persona. Los salones excluidos del cambio siguen igual.
 */

const ADMIN = { id: 1, userType: 'adm' };
const COMPANY = { id: 41, name: 'Prueba1', userId: 1 };
const LEGACY_COMPANY = { id: 12, name: 'Viejo', userId: 1 };

type Saved = Record<string, unknown>;

function repo() {
  let nextId = 100;
  const saved: Saved[] = [];
  return {
    saved,
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    create: jest.fn((data: Saved) => ({ ...data })),
    save: jest.fn((data: Saved) => {
      const row = { id: nextId++, ...data };
      saved.push(row);
      return Promise.resolve(row);
    }),
  };
}

function setup(company = COMPANY) {
  const users = repo();
  const workers = repo();
  const clients = repo();
  const companyWorkers = repo();
  const companies = repo();
  const email = {
    sendWorkerCredentials: jest.fn().mockResolvedValue(true),
    sendClientCredentials: jest.fn().mockResolvedValue(true),
  };

  users.findOne.mockImplementation(({ where }: { where: Saved }) =>
    Promise.resolve(where.userType === 'adm' ? ADMIN : null),
  );
  companies.findOne.mockResolvedValue(company);

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
    fileUploadService: { saveFile: jest.fn() },
    companyService: { getWorkerInheritedCalendar: jest.fn() },
    onboardingService: { safeRecomputeStep: jest.fn() },
    entitlements: { assertCanAddWorker: jest.fn() },
    realtime: { emitEntity: jest.fn() },
    trySendVerificationCode: jest.fn(),
    sendVerificationCode: jest.fn(),
  });

  return {
    auth: service as unknown as AuthService,
    users,
    workers,
    clients,
    companyWorkers,
    email,
  };
}

const CALLER = {
  sub: 1,
  userType: 'adm',
  companyId: 41,
} as unknown as AuthenticatedUser;

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  const error = await promise.catch((e: unknown) => e);
  return (error as BadRequestException | ConflictException).getResponse?.();
}

describe('alta de trabajador por el dueño', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  beforeEach(() => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  it('sin correo: solo la ficha, sin user, y responde con su workerId', async () => {
    const { auth, users, workers, companyWorkers, email } = setup();

    const result = await auth.registerWorker(
      {
        name: 'Luis',
        email: 'no disponible',
        identification: 'V-12345678',
      } as RegisterWorkerDto,
      1,
    );

    expect(users.save).not.toHaveBeenCalled();
    expect(email.sendWorkerCredentials).not.toHaveBeenCalled();
    expect(workers.saved[0]).toMatchObject({
      name: 'Luis',
      identification: 'V-12345678',
      userId: null,
    });
    expect(companyWorkers.saved[0]).toMatchObject({
      companyId: 41,
      userId: null,
    });
    expect(result).toMatchObject({ user: null, workerId: workers.saved[0].id });
  });

  it('sin correo y sin cédula: 400 IDENTIFICATION_REQUIRED y no se crea nada', async () => {
    const { auth, users, workers } = setup();

    expect(
      await codeOf(
        auth.registerWorker({ name: 'Luis' } as RegisterWorkerDto, 1),
      ),
    ).toMatchObject({ code: 'IDENTIFICATION_REQUIRED' });
    expect(users.save).not.toHaveBeenCalled();
    expect(workers.save).not.toHaveBeenCalled();
  });

  it('con correo: igual que siempre, con su cuenta y sus credenciales', async () => {
    const { auth, users, workers, email } = setup();

    await auth.registerWorker(
      {
        username: 'ana',
        email: 'Ana@X.com',
        identification: 'V-1234567',
      } as RegisterWorkerDto,
      1,
    );

    expect(users.saved[0]).toMatchObject({
      username: 'ana',
      email: 'ana@x.com',
      userType: 'wrk',
    });
    expect(workers.saved[0]).toMatchObject({ userId: users.saved[0].id });
    expect(email.sendWorkerCredentials).toHaveBeenCalled();
  });

  it('con correo y sin username: 400 USERNAME_REQUIRED', async () => {
    const { auth } = setup();
    expect(
      await codeOf(
        auth.registerWorker({ email: 'ana@x.com' } as RegisterWorkerDto, 1),
      ),
    ).toMatchObject({ code: 'USERNAME_REQUIRED' });
  });

  it('salón excluido, sin correo: se le sigue creando la cuenta como hoy', async () => {
    const { auth, users, workers } = setup(LEGACY_COMPANY);

    await auth.registerWorker(
      {
        username: 'luis',
        name: 'Luis',
        identification: 'V-12345678',
      } as RegisterWorkerDto,
      1,
    );

    expect(users.saved[0]).toMatchObject({ username: 'luis', email: null });
    expect(workers.saved[0]).toMatchObject({
      userId: users.saved[0].id,
      identification: null,
    });
  });
});

describe('alta de cliente por el salón', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  beforeEach(() => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  const SIN_CORREO = {
    name: 'Marta',
    email: 'no disponible',
    identification: 'E-7654321',
  } as RegisterClientByAdminDto;

  it('sin correo: solo la ficha del cliente, sin user', async () => {
    const { auth, users, clients } = setup();

    const result = await auth.registerClientByAdmin(SIN_CORREO, CALLER);

    expect(users.save).not.toHaveBeenCalled();
    expect(clients.saved[0]).toMatchObject({
      name: 'Marta',
      identification: 'E-7654321',
      companies: [41],
      userId: null,
    });
    expect(result).toMatchObject({
      user: null,
      clientId: clients.saved[0].id,
    });
  });

  it('sin correo y sin cédula: 400 IDENTIFICATION_REQUIRED', async () => {
    const { auth, clients } = setup();
    expect(
      await codeOf(
        auth.registerClientByAdmin(
          { name: 'Marta' } as RegisterClientByAdminDto,
          CALLER,
        ),
      ),
    ).toMatchObject({ code: 'IDENTIFICATION_REQUIRED' });
    expect(clients.save).not.toHaveBeenCalled();
  });

  it('la cédula ya es de un cliente de otro salón: pide confirmar el vínculo', async () => {
    const { auth, clients } = setup();
    clients.findOne.mockResolvedValue({
      id: 7,
      name: 'Marta',
      lastName: 'Gil',
      identification: 'E-7654321',
      companies: [9],
      user: null,
    });

    expect(
      await codeOf(auth.registerClientByAdmin(SIN_CORREO, CALLER)),
    ).toMatchObject({
      code: 'CLIENT_EXISTS_CONFIRM_LINK',
      clientId: 7,
      clientName: 'Marta Gil',
    });
    expect(clients.save).not.toHaveBeenCalled();
  });

  it('confirmado, se vincula al salón en vez de crear otra ficha', async () => {
    const { auth, clients } = setup();
    clients.findOne.mockResolvedValue({
      id: 7,
      identification: 'E-7654321',
      companies: [9],
      user: null,
    });

    const result = await auth.registerClientByAdmin(
      { ...SIN_CORREO, confirmLink: true },
      CALLER,
    );

    expect(clients.save).not.toHaveBeenCalled();
    expect(clients.update).toHaveBeenCalledWith(7, { companies: [9, 41] });
    expect(result).toMatchObject({ clientId: 7, user: null });
  });

  it('eliminado de este salón: ofrece reactivarlo (la cédula lo identifica)', async () => {
    const { auth, clients } = setup();
    clients.findOne.mockResolvedValue({
      id: 7,
      name: 'Marta',
      identification: 'E-7654321',
      companies: [41],
      inactiveCompanies: [41],
      user: null,
    });

    expect(
      await codeOf(auth.registerClientByAdmin(SIN_CORREO, CALLER)),
    ).toMatchObject({ code: 'CLIENT_DELETED_CONFIRM_REACTIVATE', clientId: 7 });
  });

  it('salón excluido, sin correo: se le sigue creando la cuenta como hoy', async () => {
    const { auth, users, clients } = setup(LEGACY_COMPANY);

    await auth.registerClientByAdmin({ ...SIN_CORREO, username: 'marta' }, {
      ...CALLER,
      companyId: 12,
    } as AuthenticatedUser);

    expect(users.saved[0]).toMatchObject({
      username: 'marta',
      userType: 'cli',
    });
    expect(clients.saved[0]).toMatchObject({
      userId: users.saved[0].id,
      identification: null,
    });
  });
});
