jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ConflictException } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * Reactivar una cita cancelada (o un servicio) de un cliente que el salón
 * eliminó: se bloquea hasta reactivar al cliente desde Clientes.
 */
function setup(client: Record<string, unknown> | null) {
  const service = Object.create(SessionService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    clientRepository: { findOne: jest.fn().mockResolvedValue(client) },
    companyWorkerRepository: {
      find: jest.fn().mockResolvedValue([{ id: 7, companyId: 41 }]),
    },
  });
  const assert = (
    service as unknown as {
      assertClientNotDeletedForReactivation: (
        clientId: number | null | undefined,
        companyWorkerIds: (number | null | undefined)[],
      ) => Promise<void>;
    }
  ).assertClientNotDeletedForReactivation.bind(service);
  return { assert };
}

describe('reactivar la cita de un cliente eliminado', () => {
  it('si el salón lo eliminó, responde 409 con su código', async () => {
    const { assert } = setup({
      id: 5,
      companies: [41],
      inactiveCompanies: [41],
    });

    const error = await assert(5, [7]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'CLIENT_DELETED_IN_COMPANY',
    });
  });

  it('si el cliente está activo en el salón, deja reactivar', async () => {
    const { assert } = setup({ id: 5, companies: [41], inactiveCompanies: [] });
    await expect(assert(5, [7])).resolves.toBeUndefined();
  });

  it('eliminado en OTRO salón no frena la cita de este', async () => {
    const { assert } = setup({
      id: 5,
      companies: [41, 9],
      inactiveCompanies: [9],
    });
    await expect(assert(5, [7])).resolves.toBeUndefined();
  });

  it('sin trabajador asignado no hay salón que mirar', async () => {
    const { assert } = setup({
      id: 5,
      companies: [41],
      inactiveCompanies: [41],
    });
    await expect(assert(5, [null, undefined])).resolves.toBeUndefined();
  });
});
