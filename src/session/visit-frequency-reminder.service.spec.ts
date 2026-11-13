import { VisitFrequencyReminderService } from './visit-frequency-reminder.service';

jest.mock('../email/email.service', () => ({ EmailService: class {} }));
jest.mock('../notification/notification.service', () => ({
  NotificationService: class {},
}));

const NOW = new Date('2026-11-20T13:00:00Z');

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'María',
    lastName: 'Pérez',
    email: 'maria@example.com',
    phone: '+58 4140000000',
    userId: 70,
    userEmail: 'maria@example.com',
    companies: [3],
    inactiveCompanies: [],
    companyAliases: [{ companyId: 3, alias: 'Mari' }],
    frequencies: [{ companyId: 3, days: 17, source: 'auto', updatedAt: 'x' }],
    ...overrides,
  };
}

function setup(opts: {
  clients?: Record<string, unknown>[];
  visitedAt?: string;
  upcoming?: boolean;
  claimed?: boolean;
  workers?: Record<string, unknown>[];
}) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM client cl')) {
      return Promise.resolve(opts.clients ?? [client()]);
    }
    if (sql.includes('SELECT DISTINCT s.client_id')) {
      return Promise.resolve([
        {
          clientId: 7,
          companyId: 3,
          sessionId: 900,
          visitedAt: opts.visitedAt ?? '2026-11-03T15:00:00Z',
        },
        {
          clientId: 7,
          companyId: 3,
          sessionId: 800,
          visitedAt: '2026-10-10T15:00:00Z',
        },
      ]);
    }
    if (sql.includes('FROM company co')) {
      return Promise.resolve([
        {
          id: 3,
          name: 'Barbería Sol',
          email: 'sol@example.com',
          address: null,
          ownerId: 30,
          ownerEmail: 'owner@example.com',
          ownerName: 'Ana',
        },
      ]);
    }
    if (sql.includes('LIMIT 1')) {
      return Promise.resolve(opts.upcoming ? [{ 1: 1 }] : []);
    }
    if (sql.includes('FROM session_detail d')) {
      return Promise.resolve(
        opts.workers ?? [
          { userId: 40, email: 'luis@example.com', name: 'Luis' },
          { userId: 30, email: 'owner@example.com', name: 'Ana' },
        ],
      );
    }
    return Promise.resolve([]);
  });
  const notifications = {
    claimReminder: jest.fn().mockResolvedValue(opts.claimed ?? true),
    createNotification: jest.fn().mockResolvedValue({}),
  };
  const email = {
    sendVisitFrequencyReminderToClient: jest.fn().mockResolvedValue(true),
    sendVisitFrequencyDigestToStaff: jest.fn().mockResolvedValue(true),
  };
  const service = new VisitFrequencyReminderService(
    { query } as never,
    notifications as never,
    email as never,
  );
  return { service, notifications, email };
}

describe('VisitFrequencyReminderService', () => {
  it('avisa al cliente, al dueño y al trabajador que lo atendió el día que le toca', async () => {
    const { service, notifications, email } = setup({});

    const result = await service.run(NOW);

    expect(result).toEqual({ clients: 1, staff: 2 });
    expect(notifications.claimReminder).toHaveBeenCalledWith(
      'visit_freq_due_3',
      900,
    );
    const recipients = notifications.createNotification.mock.calls.map(
      (c) => c[0],
    );
    expect(recipients.sort()).toEqual([30, 40, 70]);

    const clientCall = notifications.createNotification.mock.calls.find(
      (c) => c[0] === 70,
    );
    expect(clientCall[1].title).toBe('Ya te toca tu cita en Barbería Sol');
    expect(clientCall[1].data).toMatchObject({
      subtype: 'visit_frequency',
      audience: 'client',
      companyId: 3,
    });

    const staffCall = notifications.createNotification.mock.calls.find(
      (c) => c[0] === 40,
    );
    expect(staffCall[1].title).toBe('Hoy le toca volver a Mari');
    expect(staffCall[1].data).toMatchObject({
      audience: 'staff',
      clientId: 7,
    });

    expect(email.sendVisitFrequencyReminderToClient).toHaveBeenCalledTimes(1);
    expect(email.sendVisitFrequencyDigestToStaff).toHaveBeenCalledTimes(2);
  });

  it('avisa unos días antes y cuando está atrasado', async () => {
    const soon = setup({ visitedAt: '2026-11-05T15:00:00Z' });
    await soon.service.run(NOW);
    expect(soon.notifications.claimReminder).toHaveBeenCalledWith(
      'visit_freq_soon_3',
      900,
    );

    const overdue = setup({ visitedAt: '2026-10-25T15:00:00Z' });
    await overdue.service.run(NOW);
    expect(overdue.notifications.claimReminder).toHaveBeenCalledWith(
      'visit_freq_overdue_3',
      900,
    );
  });

  it('no avisa si ya tiene cita agendada', async () => {
    const { service, notifications } = setup({ upcoming: true });
    await service.run(NOW);
    expect(notifications.claimReminder).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('no repite el aviso del mismo ciclo', async () => {
    const { service, notifications, email } = setup({ claimed: false });
    await service.run(NOW);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(email.sendVisitFrequencyReminderToClient).not.toHaveBeenCalled();
  });

  it('no avisa si el negocio lo eliminó', async () => {
    const { service, notifications } = setup({
      clients: [client({ inactiveCompanies: [3] })],
    });
    await service.run(NOW);
    expect(notifications.claimReminder).not.toHaveBeenCalled();
  });

  it('sin cuenta ni correo solo avisa al negocio', async () => {
    const { service, notifications, email } = setup({
      clients: [client({ userId: null, userEmail: null, email: null })],
    });
    await service.run(NOW);
    const recipients = notifications.createNotification.mock.calls.map(
      (c) => c[0],
    );
    expect(recipients).not.toContain(70);
    expect(email.sendVisitFrequencyReminderToClient).not.toHaveBeenCalled();
    expect(email.sendVisitFrequencyDigestToStaff).toHaveBeenCalled();
  });

  it('junta varios clientes en un solo resumen por persona', async () => {
    const { service, notifications } = setup({
      clients: [client(), client({ id: 8, name: 'Juan', companyAliases: [] })],
      workers: [],
    });
    const query = (service as unknown as { dataSource: { query: jest.Mock } })
      .dataSource.query;
    const original = query.getMockImplementation()!;
    query.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT DISTINCT s.client_id')) {
        return Promise.resolve([
          {
            clientId: 7,
            companyId: 3,
            sessionId: 900,
            visitedAt: '2026-11-03T15:00:00Z',
          },
          {
            clientId: 8,
            companyId: 3,
            sessionId: 901,
            visitedAt: '2026-10-25T15:00:00Z',
          },
        ]);
      }
      return original(sql, params);
    });

    await service.run(NOW);

    const ownerCalls = notifications.createNotification.mock.calls.filter(
      (c) => c[0] === 30,
    );
    expect(ownerCalls).toHaveLength(1);
    expect(ownerCalls[0][1].title).toBe('2 clientes por volver');
    expect(ownerCalls[0][1].body).toBe(
      'Hoy le toca a 1, 1 está atrasado. Ninguno tiene cita agendada.',
    );
  });
});
