import { isWithinOpenHours } from './booking-hours.util';

// La zona del negocio por defecto es America/Caracas (UTC-4, sin horario de
// verano): 10:00 locales = 14:00Z.
const at = (isoLocalDate: string, hour: number, minute = 0) =>
  new Date(
    `${isoLocalDate}T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );

const t = (hour: number, minute: number, period: 'AM' | 'PM') => ({
  hour,
  minute,
  period,
});

// 2026-10-05 es lunes; 2026-10-04, domingo.
const MONDAY = '2026-10-05';
const SUNDAY = '2026-10-04';

const company = {
  schedule: {
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    morning: { start: t(9, 0, 'AM'), end: t(12, 0, 'PM') },
    afternoon: { start: t(12, 0, 'PM'), end: t(6, 0, 'PM') },
  },
  exceptions: [],
};

describe('isWithinOpenHours', () => {
  it('acepta una cita dentro del horario de la empresa', () => {
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 10),
        durationMinutes: 60,
        companyCalendarDetail: company,
        workerCalendar: null,
      }),
    ).toBe(true);
  });

  it('une mañana y tarde cuando se tocan (cita que cruza el mediodía)', () => {
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 11, 30),
        durationMinutes: 60,
        companyCalendarDetail: company,
        workerCalendar: null,
      }),
    ).toBe(true);
  });

  it('rechaza una cita que termina después del cierre', () => {
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 17, 30),
        durationMinutes: 60,
        companyCalendarDetail: company,
        workerCalendar: null,
      }),
    ).toBe(false);
  });

  it('rechaza un día que no está en el horario', () => {
    expect(
      isWithinOpenHours({
        start: at(SUNDAY, 10),
        durationMinutes: 30,
        companyCalendarDetail: company,
        workerCalendar: null,
      }),
    ).toBe(false);
  });

  it('rechaza un día marcado como no laborable', () => {
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 10),
        durationMinutes: 30,
        companyCalendarDetail: {
          ...company,
          exceptions: [{ date: MONDAY, type: 'non-working-day' }],
        },
        workerCalendar: null,
      }),
    ).toBe(false);
  });

  it('usa el horario especial de una excepción (formato heredado dentro de schedule)', () => {
    const detail = {
      schedule: {
        ...company.schedule,
        exceptions: [
          {
            date: SUNDAY,
            type: 'custom-schedule',
            morning: { start: t(9, 0, 'AM'), end: t(1, 0, 'PM') },
          },
        ],
      },
      exceptions: [],
    };
    expect(
      isWithinOpenHours({
        start: at(SUNDAY, 10),
        durationMinutes: 60,
        companyCalendarDetail: detail,
        workerCalendar: null,
      }),
    ).toBe(true);
  });

  it('manda el horario propio del trabajador aunque la empresa esté abierta', () => {
    const worker = {
      days: ['tuesday'],
      morning: { start: t(9, 0, 'AM'), end: t(12, 0, 'PM') },
    };
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 10),
        durationMinutes: 30,
        companyCalendarDetail: company,
        workerCalendar: worker,
      }),
    ).toBe(false);
  });

  it('acepta el calendario del trabajador guardado como JSON en texto', () => {
    const worker = JSON.stringify({
      days: ['monday'],
      morning: { start: t(7, 0, 'AM'), end: t(9, 0, 'AM') },
    });
    expect(
      isWithinOpenHours({
        start: at(MONDAY, 7, 30),
        durationMinutes: 60,
        companyCalendarDetail: company,
        workerCalendar: worker,
      }),
    ).toBe(true);
  });
});
