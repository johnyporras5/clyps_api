import { Server } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { companyRoom, workerRoom } from './rooms';

/** Server falso: guarda a qué rooms se emitió y con qué payload. */
function setup() {
  const sent: { rooms: string[]; event: string; payload: unknown }[] = [];
  const server = {
    to: (rooms: string[]) => ({
      emit: (event: string, payload: unknown) =>
        sent.push({ rooms, event, payload }),
    }),
  } as unknown as Server;
  const service = new RealtimeService();
  service.setServer(server);
  return { service, sent };
}

const CLIENT = { id: 5, name: 'Ana', identification: 'V-1234567' };

describe('RealtimeService: cédula en eventos de salones excluidos', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  beforeEach(() => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  it('el evento de un salón excluido sale sin la cédula', () => {
    const { service, sent } = setup();
    service.emitEntity(companyRoom(12), {
      type: 'client.added',
      entityId: 5,
      companyId: 12,
      data: CLIENT,
    });

    expect((sent[0].payload as { data: unknown }).data).toEqual({
      id: 5,
      name: 'Ana',
    });
  });

  it('a la room de un trabajador se decide por el salón del evento', () => {
    const { service, sent } = setup();
    service.emitEntity(workerRoom(77), {
      type: 'session.updated',
      entityId: 1,
      companyId: 12,
      data: { client: CLIENT },
    });

    expect(
      (sent[0].payload as { data: { client: unknown } }).data.client,
    ).toEqual({ id: 5, name: 'Ana' });
  });

  it('un salón normal recibe el evento tal cual', () => {
    const { service, sent } = setup();
    service.emitEntity(companyRoom(41), {
      type: 'client.added',
      entityId: 5,
      companyId: 41,
      data: CLIENT,
    });

    expect((sent[0].payload as { data: unknown }).data).toBe(CLIENT);
  });
});
