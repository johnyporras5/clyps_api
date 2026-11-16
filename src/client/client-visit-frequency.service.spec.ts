import { ClientVisitFrequencyService } from './client-visit-frequency.service';
import type { CompanyVisitFrequency } from './entities/client.entity';

function setup(
  entries: CompanyVisitFrequency[] | null,
  visits: { id: number; visitedAt: string }[],
) {
  const clientRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: 7, companyVisitFrequencies: entries }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.getRawMany = jest.fn().mockResolvedValue(visits);
  const sessionRepository = {
    createQueryBuilder: jest.fn(() => builder),
  };
  const service = new ClientVisitFrequencyService(
    clientRepository as never,
    sessionRepository as never,
    {} as never,
  );
  return { service, clientRepository, sessionRepository };
}

const manual: CompanyVisitFrequency = {
  companyId: 3,
  days: 15,
  source: 'manual',
  updatedAt: 'x',
};

const twoVisits = [
  { id: 1, visitedAt: '2026-10-01T15:00:00Z' },
  { id: 2, visitedAt: '2026-10-11T15:00:00Z' },
];

describe('ClientVisitFrequencyService.recalculate', () => {
  it('no toca una frecuencia puesta a mano', async () => {
    const { service, clientRepository, sessionRepository } = setup(
      [manual],
      twoVisits,
    );

    await expect(service.recalculate(7, 3)).resolves.toBe(15);
    expect(sessionRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(clientRepository.update).not.toHaveBeenCalled();
  });

  it('vuelve a calcularla cuando se pide automática', async () => {
    const { service, clientRepository } = setup([manual], twoVisits);

    await expect(
      service.recalculate(7, 3, { overrideManual: true }),
    ).resolves.toBe(10);
    const saved = clientRepository.update.mock.calls[0][1]
      .companyVisitFrequencies as CompanyVisitFrequency[];
    expect(saved).toEqual([
      expect.objectContaining({ companyId: 3, days: 10, source: 'auto' }),
    ]);
  });

  it('quita la manual si al pedir automática no hay historial suficiente', async () => {
    const { service, clientRepository } = setup([manual], [twoVisits[0]]);

    await expect(
      service.recalculate(7, 3, { overrideManual: true }),
    ).resolves.toBeNull();
    expect(clientRepository.update).toHaveBeenCalledWith(7, {
      companyVisitFrequencies: [],
    });
  });

  it('sigue actualizando la automática', async () => {
    const { service, clientRepository } = setup(
      [{ ...manual, days: 30, source: 'auto' }],
      twoVisits,
    );

    await expect(service.recalculate(7, 3)).resolves.toBe(10);
    expect(clientRepository.update).toHaveBeenCalled();
  });
});
