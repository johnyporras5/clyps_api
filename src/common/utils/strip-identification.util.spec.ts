import { stripIdentification } from './strip-identification.util';

class FakeEntity {
  id = 1;
  name = 'Ana';
  identification: string | null = 'V-12345678';
}

describe('quitar la cédula de una respuesta', () => {
  it('la quita a cualquier profundidad: citas con su cliente y su trabajador', () => {
    const body = {
      data: [
        {
          id: 10,
          client: { id: 1, name: 'Ana', identification: 'V-1234567' },
          worker: { id: 2, identification: 'E-7654321', user: { id: 9 } },
        },
      ],
      total: 1,
    };

    expect(stripIdentification(body)).toEqual({
      data: [
        {
          id: 10,
          client: { id: 1, name: 'Ana' },
          worker: { id: 2, user: { id: 9 } },
        },
      ],
      total: 1,
    });
  });

  it('no toca el original: puede seguir usándose o ir a otro salón', () => {
    const client = { id: 1, identification: 'V-1234567' };
    stripIdentification({ client });
    expect(client.identification).toBe('V-1234567');
  });

  it('las entidades salen como objetos planos, sin el campo', () => {
    expect(stripIdentification(new FakeEntity())).toEqual({
      id: 1,
      name: 'Ana',
    });
  });

  it('deja otros campos parecidos, como el de los pagos de Cobrix', () => {
    expect(stripIdentification({ payerIdentification: 'J-401234567' })).toEqual(
      { payerIdentification: 'J-401234567' },
    );
  });

  it('respeta fechas, nulos y valores sueltos', () => {
    const date = new Date('2026-10-05T12:00:00Z');
    expect(stripIdentification({ at: date, x: null, n: 3 })).toEqual({
      at: date,
      x: null,
      n: 3,
    });
    expect(stripIdentification('texto')).toBe('texto');
    expect(stripIdentification(undefined)).toBeUndefined();
  });

  it('no se cuelga con referencias circulares', () => {
    const user: Record<string, unknown> = { id: 9, identification: 'V-1' };
    const worker = { id: 2, user, identification: 'V-2' };
    user.worker = worker;

    const out = stripIdentification(worker) as {
      user: { worker: unknown; identification?: string };
    };
    expect(out.user.identification).toBeUndefined();
    expect(out.user.worker).toBe(out);
  });
});
