import { dueReminder, daysUntil } from './reminder-schedule.util';

/** El escalado de avisos del ticket: -7, -3, -1, 0, gracia y bloqueo. */

const NOW = new Date('2026-09-01T09:00:00.000Z');

function inDays(n: number): Date {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
}

function due(currentPeriodEnd: Date | null, graceEndsAt: Date | null = null) {
  return dueReminder({
    trialEndsAt: null,
    currentPeriodEnd,
    graceEndsAt,
    graceDays: 5,
    now: NOW,
  });
}

describe('el escalado de recordatorios', () => {
  it('avisa en -7, -3, -1 y el día del vencimiento', () => {
    expect(due(inDays(7))?.tier).toBe('d-7');
    expect(due(inDays(3))?.tier).toBe('d-3');
    expect(due(inDays(1))?.tier).toBe('d-1');
    expect(due(inDays(0))?.tier).toBe('d0');
  });

  it('no avisa los días intermedios: un "faltan 3" enviado con 5 miente', () => {
    expect(due(inDays(10))).toBeNull();
    expect(due(inDays(5))).toBeNull();
    expect(due(inDays(2))).toBeNull();
  });

  it('vencido y dentro de la gracia: avisa la cortesía', () => {
    const reminder = due(inDays(-1));
    expect(reminder?.tier).toBe('grace');
    // El aviso sigue disponible mientras dure la gracia: si el cron se salta un
    // día, el aviso no se pierde (repetirlo lo impide la bitácora).
    expect(due(inDays(-3))?.tier).toBe('grace');
  });

  it('agotada la gracia: avisa el bloqueo', () => {
    expect(due(inDays(-6))?.tier).toBe('blocked');
    expect(due(inDays(-40))?.tier).toBe('blocked');
  });

  it('respeta la gracia ya fijada en la fila, no la calculada', () => {
    // Venció hace 3 días pero su gracia terminó ayer: está bloqueado.
    expect(due(inDays(-3), inDays(-1))?.tier).toBe('blocked');
  });

  it('sin fecha de vencimiento no hay nada que recordar', () => {
    expect(due(null)).toBeNull();
  });

  it('en la prueba cuenta contra trialEndsAt', () => {
    const reminder = dueReminder({
      trialEndsAt: inDays(3),
      currentPeriodEnd: null,
      graceEndsAt: null,
      graceDays: 5,
      now: NOW,
    });
    expect(reminder).toMatchObject({ tier: 'd-3', daysLeft: 3 });
    expect(reminder?.periodEnd.getTime()).toBe(inDays(3).getTime());
  });

  it('cuenta días de calendario, no horas: la hora del cron no mueve el aviso', () => {
    // Fechas locales a propósito: los días se cuentan en la zona del servidor.
    const target = new Date(2026, 8, 8, 23, 30);
    expect(daysUntil(target, new Date(2026, 8, 1, 0, 10))).toBe(7);
    expect(daysUntil(target, new Date(2026, 8, 1, 23, 50))).toBe(7);
  });
});
