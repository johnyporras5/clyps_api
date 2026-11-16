jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { ClientService } from './client.service';

function setup(currentPhone: string | null) {
  const client = {
    id: 7,
    phone: currentPhone,
    picture: null,
    user: { email: 'cliente@example.com' },
    companies: [3],
  };
  const clientRepository = {
    findOne: jest.fn().mockResolvedValue(client),
    save: jest.fn((entity: typeof client) => Promise.resolve({ ...entity })),
  };
  const service = Object.create(ClientService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    clientRepository,
    logger: { warn: jest.fn(), log: jest.fn() },
    fileUploadService: { getFileUrl: jest.fn() },
    assertCanAccessClient: jest.fn().mockResolvedValue(undefined),
    resolveActivationTargets: jest.fn().mockResolvedValue([3]),
  });
  const update = (phone: string) =>
    (service as unknown as ClientService).updateClientByAdmin(
      7,
      { phone } as never,
      undefined,
      1,
      'adm',
      3,
    );
  return { update, clientRepository };
}

describe('ClientService.updateClientByAdmin: teléfono', () => {
  it('guarda el teléfono si el cliente no tenía', async () => {
    const { update, clientRepository } = setup(null);

    const result = await update('+58 4141234567');

    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+58 4141234567' }),
    );
    expect(result.phone).toBe('+58 4141234567');
  });

  it('no cambia el teléfono si el cliente ya tiene uno', async () => {
    const { update, clientRepository } = setup('+58 4240000000');

    const result = await update('+58 4141234567');

    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+58 4240000000' }),
    );
    expect(result.phone).toBe('+58 4240000000');
  });

  it('rechaza un teléfono que no es válido', async () => {
    const { update, clientRepository } = setup('');

    await expect(update('123')).rejects.toBeInstanceOf(BadRequestException);
    expect(clientRepository.save).not.toHaveBeenCalled();
  });
});
