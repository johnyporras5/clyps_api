import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Repository } from 'typeorm';
import type { User } from '../user/entities/user.entity';
import {
  CreateContactLogDto,
  UpdateContactLogDto,
} from './dto/contact-log.dto';
import type { PanelContactLog } from './entities/panel-contact-log.entity';
import { PanelContactsController } from './panel-contacts.controller';
import { PanelContactsService } from './panel-contacts.service';

const T0 = new Date('2026-11-16T15:00:00Z');

function row(over: Partial<PanelContactLog> = {}): PanelContactLog {
  return {
    id: 1,
    userId: 7,
    channel: 'whatsapp',
    outcome: 'no_reply',
    note: null,
    followUpOn: null,
    contactedAt: T0,
    createdBy: 1,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function build(
  opts: { userExists?: boolean; found?: PanelContactLog | null } = {},
) {
  const save = jest.fn((r: PanelContactLog) =>
    Promise.resolve(Object.assign({ id: 10 }, r)),
  );
  const del = jest.fn().mockResolvedValue({ affected: 1 });
  const findBy = jest.fn().mockResolvedValue([row({ id: 5 })]);
  const logs = {
    create: jest.fn((r: Partial<PanelContactLog>) => r),
    save,
    delete: del,
    find: jest.fn().mockResolvedValue([row(), row({ id: 2, createdBy: null })]),
    findBy,
    findOneBy: jest
      .fn()
      .mockResolvedValue(opts.found === undefined ? row() : opts.found),
    query: jest.fn().mockResolvedValue([{ id: '5', total: '3' }]),
  } as unknown as Repository<PanelContactLog>;
  const users = {
    exists: jest.fn().mockResolvedValue(opts.userExists ?? true),
    find: jest.fn().mockResolvedValue([{ id: 1, email: 'admin@clyps.app' }]),
  } as unknown as Repository<User>;
  return {
    service: new PanelContactsService(logs, users),
    save,
    del,
    logs,
    findBy,
  };
}

describe('PanelContactsService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(T0));
  afterEach(() => jest.useRealTimers());

  it('resumen: último contacto y total por dueño', async () => {
    const t = build();
    const out = await t.service.summary();
    expect(out).toEqual([
      expect.objectContaining({
        userId: 7,
        total: 3,
        last: expect.objectContaining({ id: 5 }),
      }),
    ]);
  });

  it('resumen vacío no hace la segunda consulta', async () => {
    const t = build();
    (t.logs.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(t.service.summary()).resolves.toEqual([]);
    expect(t.findBy).not.toHaveBeenCalled();
  });

  it('historial con el correo de quien anotó', async () => {
    const out = await build().service.history(7);
    expect(out[0].createdByEmail).toBe('admin@clyps.app');
    expect(out[1].createdByEmail).toBeNull();
  });

  it('anotar: por defecto "sin respuesta", ahora y con autor', async () => {
    const t = build();
    const out = await t.service.create(7, { channel: 'instagram' }, 1);
    expect(t.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        channel: 'instagram',
        outcome: 'no_reply',
        note: null,
        followUpOn: null,
        contactedAt: T0,
        createdBy: 1,
      }),
    );
    expect(out.contactedAt).toBe(T0.toISOString());
  });

  it('404 si la cuenta no existe', async () => {
    const t = build({ userExists: false });
    await expect(
      t.service.create(99, { channel: 'call' }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.save).not.toHaveBeenCalled();
  });

  it('rechaza una fecha de contacto futura', async () => {
    const t = build();
    await expect(
      t.service.create(
        7,
        { channel: 'call', contactedAt: '2026-11-17T15:00:00Z' },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un contacto de ayer (anotado tarde)', async () => {
    const t = build();
    await t.service.create(
      7,
      { channel: 'call', contactedAt: '2026-11-15T15:00:00Z' },
      1,
    );
    expect(t.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contactedAt: new Date('2026-11-15T15:00:00Z'),
      }),
    );
  });

  it('rechaza un seguimiento en un año absurdo', async () => {
    await expect(
      build().service.create(
        7,
        { channel: 'call', followUpOn: '3026-01-01' },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('corregir: null borra, ausente no toca', async () => {
    const t = build({ found: row({ note: 'hola', followUpOn: '2026-11-20' }) });
    await t.service.update(1, { outcome: 'replied', followUpOn: null }, 1);
    expect(t.save).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'replied',
        note: 'hola',
        followUpOn: null,
      }),
    );
  });

  it('corregir algo borrado da 404', async () => {
    await expect(
      build({ found: null }).service.update(1, { outcome: 'replied' }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrar es idempotente', async () => {
    const t = build();
    t.del.mockResolvedValueOnce({ affected: 0 });
    await expect(t.service.remove(1, 1)).resolves.toBeUndefined();
  });
});

describe('DTO de contacto', () => {
  const errors = async (
    cls: typeof CreateContactLogDto | typeof UpdateContactLogDto,
    body: object,
  ) => (await validate(plainToInstance(cls, body))).map((e) => e.property);

  it('canal obligatorio y de la lista', async () => {
    expect(await errors(CreateContactLogDto, {})).toContain('channel');
    expect(
      await errors(CreateContactLogDto, { channel: 'telegram' }),
    ).toContain('channel');
    expect(await errors(CreateContactLogDto, { channel: 'whatsapp' })).toEqual(
      [],
    );
  });

  it('fecha de seguimiento: solo días reales', async () => {
    expect(
      await errors(CreateContactLogDto, {
        channel: 'call',
        followUpOn: '2026-02-30',
      }),
    ).toContain('followUpOn');
    expect(
      await errors(CreateContactLogDto, {
        channel: 'call',
        followUpOn: '2026-11-20T10:00',
      }),
    ).toContain('followUpOn');
    expect(
      await errors(CreateContactLogDto, {
        channel: 'call',
        followUpOn: '2026-11-20',
      }),
    ).toEqual([]);
  });

  it('nota: se recorta, vacía es null y tiene tope', async () => {
    const dto = plainToInstance(CreateContactLogDto, {
      channel: 'call',
      note: '   ',
    });
    expect(dto.note).toBeNull();
    expect(
      await errors(CreateContactLogDto, {
        channel: 'call',
        note: 'x'.repeat(1001),
      }),
    ).toContain('note');
  });

  it('al corregir, null es válido para quitar nota y seguimiento', async () => {
    expect(
      await errors(UpdateContactLogDto, { note: null, followUpOn: null }),
    ).toEqual([]);
  });
});

describe('PanelContactsController', () => {
  // El RolesGuard lee la metadata del HANDLER: si un método la pierde, cualquier
  // dueño logueado podría leer o escribir el historial de todos los salones.
  it.each(['summary', 'history', 'create', 'update', 'remove'] as const)(
    '%s exige padm',
    (method) => {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        PanelContactsController.prototype,
        method,
      )?.value;
      expect(Reflect.getMetadata('roles', handler as object)).toEqual(['padm']);
    },
  );
});
