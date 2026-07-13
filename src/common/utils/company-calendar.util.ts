/**
 * Normalización del horario de la empresa (`calendar_company.calendar_detail`).
 *
 * En producción conviven dos formas del mismo JSON, porque el backend siempre
 * guardó el objeto tal como llegaba del cliente:
 *
 *   Forma A (actual, canónica) — excepciones en la RAÍZ, con el horario especial
 *   envuelto en `customSchedule`:
 *     {
 *       schedule:   { days, morning, afternoon },
 *       exceptions: [{ id, date, type, reason, createdAt, updatedAt,
 *                      customSchedule?: { morning, afternoon } }]
 *     }
 *
 *   Forma B (heredada) — excepciones DENTRO de `schedule` y en formato plano,
 *   sin id ni timestamps. La escribía el editor de horario viejo del admin web
 *   (el `ScheduleModal`, hasta el commit c617b21 del front). Ya no la escribe
 *   nadie, pero quedaron datos guardados así:
 *     {
 *       schedule:   { days, morning, afternoon,
 *                     exceptions: [{ date, type, reason?, morning?, afternoon? }] },
 *       exceptions: []
 *     }
 *
 * La Forma B es la que rompía: las pantallas de admin y el filtro de
 * disponibilidad leen las excepciones de la raíz, así que las de esas empresas
 * se ignoraban en silencio (aparecían disponibles en días declarados cerrados).
 *
 * Canonizamos SIEMPRE a la Forma A: es la que ya leen el editor de admin (web y
 * móvil) y los flujos de agendado del front.
 *
 * OJO: esto es solo para el calendario de la EMPRESA. El calendario del
 * TRABAJADOR (`company_worker.calendar`) usa la convención opuesta a propósito
 * —es plano y lleva sus excepciones dentro, en formato plano— y no debe pasar
 * por aquí.
 */

export interface NormalizedCalendarDetail {
  schedule?: Record<string, any>;
  exceptions: Array<Record<string, any>>;
  [key: string]: any;
}

/** Una excepción está en formato plano (Forma B) si trae las horas sueltas. */
function isFlatException(exception: Record<string, any>): boolean {
  return (
    exception.customSchedule === undefined &&
    (exception.morning !== undefined || exception.afternoon !== undefined)
  );
}

/**
 * Lleva una excepción heredada al formato de la raíz: envuelve las horas en
 * `customSchedule` y le genera los campos que el editor del admin espera. Sin
 * esto, el admin las vería sin horario.
 */
function toRootException(
  exception: Record<string, any>,
  now: Date,
): Record<string, any> {
  const timestamp = now.toISOString();
  const normalized: Record<string, any> = {
    id: exception.id ?? `exc_${exception.date}_${now.getTime()}`,
    date: exception.date,
    type: exception.type,
    reason: exception.reason ?? '',
    createdAt: exception.createdAt ?? timestamp,
    updatedAt: exception.updatedAt ?? timestamp,
  };

  if (exception.customSchedule !== undefined) {
    normalized.customSchedule = exception.customSchedule;
  } else if (isFlatException(exception)) {
    const customSchedule: Record<string, any> = {};
    if (exception.morning !== undefined) {
      customSchedule.morning = exception.morning;
    }
    if (exception.afternoon !== undefined) {
      customSchedule.afternoon = exception.afternoon;
    }
    normalized.customSchedule = customSchedule;
  }

  return normalized;
}

/**
 * Devuelve el calendarDetail en Forma A, venga en la forma que venga.
 *
 * Mueve las excepciones que estén dentro de `schedule` a la raíz, convirtiendo
 * las planas al formato con `customSchedule`. Si la misma fecha existe en los
 * dos sitios, gana la de la raíz (es la que el admin ve y edita hoy).
 *
 * Es idempotente: aplicarlo a un calendario ya normalizado no lo cambia.
 */
export function normalizeCompanyCalendarDetail(
  calendarDetail: unknown,
  now: Date = new Date(),
): NormalizedCalendarDetail | null {
  let detail: any = calendarDetail;

  if (typeof detail === 'string') {
    try {
      detail = JSON.parse(detail);
    } catch {
      return null;
    }
  }
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return null;
  }

  const rootExceptions: any[] = Array.isArray(detail.exceptions)
    ? detail.exceptions
    : [];
  const nestedExceptions: any[] = Array.isArray(detail.schedule?.exceptions)
    ? detail.schedule.exceptions
    : [];

  const byDate = new Map<string, Record<string, any>>();
  // Las anidadas primero para que las de la raíz las pisen ante un empate.
  for (const exception of [...nestedExceptions, ...rootExceptions]) {
    if (!exception?.date) continue;
    byDate.set(exception.date, toRootException(exception, now));
  }

  const schedule: Record<string, any> | undefined = detail.schedule
    ? { ...detail.schedule }
    : undefined;
  // La raíz es la única fuente de verdad de las excepciones.
  if (schedule) delete schedule.exceptions;

  return {
    ...detail,
    ...(schedule ? { schedule } : {}),
    exceptions: Array.from(byDate.values()),
  };
}
