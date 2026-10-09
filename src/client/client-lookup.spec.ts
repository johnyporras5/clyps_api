jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { ClientService } from './client.service';

/**
 * Búsqueda por cédula antes de dar de alta a un cliente: qué encuentra y qué
 * deja ver de un cliente que todavía no es del salón.
 */
function setup(rows: Record<string, unknown>[]) {
  const clients = { find: jest.fn().mockResolvedValue(rows) };
  const service = Object.create(ClientService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    clientRepository: clients,
    companyRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 41 }),
    },
    companyWorkerRepository: {
      findOne: jest.fn().mockResolvedValue({ companyId: 41 }),
    },
    fileUploadService: {
      getFileUrl: (folder: string, file: string) => `url/${folder}/${file}`,
    },
    CLIENT_PHOTO_FOLDER: 'client_photo',
  });
  return { service: service as unknown as ClientService, clients };
}

const ADMIN = { sub: 1, userType: 'adm', companyId: 41 };

describe('buscar cliente por cédula', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  beforeEach(() => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  it('normaliza lo escrito antes de buscar', async () => {
    const { service, clients } = setup([]);
    await expect(
      service.lookupByIdentification('v 12.345.678', ADMIN),
    ).resolves.toEqual({ status: 'not_found' });
    expect(clients.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identification: 'V-12345678', permanentlyDeleted: false },
      }),
    );
  });

  it('una cédula mal escrita responde 400', async () => {
    const { service } = setup([]);
    await expect(
      service.lookupByIdentification('123', ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si está en su salón, lo dice con su id', async () => {
    const { service } = setup([
      { id: 5, name: 'Ana', lastName: 'Gil', companies: [41] },
    ]);
    await expect(
      service.lookupByIdentification('V-12345678', ADMIN),
    ).resolves.toEqual({ status: 'in_company', clientId: 5, name: 'Ana Gil' });
  });

  it('si su salón lo eliminó, lo ofrece para reactivar', async () => {
    const { service } = setup([
      { id: 5, name: 'Ana', companies: [41], inactiveCompanies: [41] },
    ]);
    await expect(
      service.lookupByIdentification('V-12345678', ADMIN),
    ).resolves.toMatchObject({ status: 'deleted_in_company', clientId: 5 });
  });

  it('su salón gana aunque haya una ficha más antigua en otro', async () => {
    const { service } = setup([
      { id: 2, name: 'Otra', companies: [9] },
      { id: 5, name: 'Ana', companies: [41] },
    ]);
    await expect(
      service.lookupByIdentification('V-12345678', ADMIN),
    ).resolves.toMatchObject({ status: 'in_company', clientId: 5 });
  });

  it('de otro salón: sus datos para llenar el formulario, sin su id', async () => {
    const { service } = setup([
      {
        id: 2,
        name: 'Ana',
        lastName: 'Gil',
        phone: '+584141234567',
        birthDate: '1990-05-01',
        location: 'Barquisimeto',
        picture: 'ana.jpg',
        companies: [9],
        user: { email: 'ana.gil@gmail.com', username: 'anagil' },
      },
    ]);
    const result = await service.lookupByIdentification('V-12345678', ADMIN);
    expect(result).toEqual({
      status: 'other_company',
      name: 'Ana Gil',
      email: 'ana.gil@gmail.com',
      username: 'anagil',
      phone: '+584141234567',
      birthdate: '1990-05-01',
      location: 'Barquisimeto',
      photoUrl: 'url/client_photo/ana.jpg',
      hasAccount: true,
    });
    expect(result).not.toHaveProperty('clientId');
  });

  it('de otro salón sin cuenta: el correo de la ficha y sin usuario', async () => {
    const { service } = setup([
      {
        id: 2,
        name: 'Ana',
        email: 'ana@ficha.com',
        companies: [9],
        user: null,
      },
    ]);
    await expect(
      service.lookupByIdentification('V-12345678', ADMIN),
    ).resolves.toMatchObject({
      status: 'other_company',
      email: 'ana@ficha.com',
      username: null,
      photoUrl: null,
      hasAccount: false,
    });
  });

  it('un salón excluido no busca', async () => {
    const { service, clients } = setup([{ id: 2, companies: [9] }]);
    await expect(
      service.lookupByIdentification('V-12345678', {
        ...ADMIN,
        companyId: 12,
      }),
    ).resolves.toEqual({ status: 'not_found' });
    expect(clients.find).not.toHaveBeenCalled();
  });

  it('token viejo sin salón: lo resuelve por el dueño', async () => {
    const { service } = setup([{ id: 5, name: 'Ana', companies: [41] }]);
    await expect(
      service.lookupByIdentification('V-12345678', {
        sub: 1,
        userType: 'adm',
        companyId: null,
      }),
    ).resolves.toMatchObject({ status: 'in_company' });
  });
});
