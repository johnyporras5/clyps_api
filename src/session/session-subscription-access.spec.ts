/* eslint-disable @typescript-eslint/unbound-method --
 * Aquí los métodos se leen como VALOR, nunca se llaman: la metadata de los
 * decoradores de Nest vive colgada de la propia función, así que hace falta la
 * referencia. No hay `this` que pueda perderse.
 */

// `uuid` se publica como ESM y jest no lo transforma. Importar el controlador
// arrastra media aplicación hasta llegar a él, y esta prueba solo necesita leer
// la metadata de sus decoradores.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { SessionController } from './session.controller';
import {
  REQUIRES_OPERATION,
  type OperationRule,
} from '../subscription/guards/requires-feature.decorator';

/**
 * Qué puede hacer el TRABAJADOR con el salón bloqueado (SUB-12).
 *
 * El controlador de citas está marcado entero, así que por defecto el bloqueo
 * corta todo lo que cuelga de él. Estas excepciones son decisiones de producto,
 * no detalles de implementación: la deuda es del dueño, y al trabajador no se le
 * puede esconder su propio trabajo ni lo que ganó.
 *
 * Se prueba leyendo la metadata y no levantando el módulo porque lo que puede
 * romperse es justamente eso: que alguien borre un decorador al refactorizar y
 * nadie se entere hasta que un trabajador se quede sin ver su historial.
 */

/** Los roles que ese handler exime del bloqueo. */
const exentosDe = (handler: unknown): string[] => {
  const rule = Reflect.getMetadata(REQUIRES_OPERATION, handler as object) as
    | OperationRule
    | undefined;
  return rule?.allowWhenBlocked ?? [];
};

describe('el dueño con el salón bloqueado', () => {
  const proto = SessionController.prototype;

  /**
   * "Análisis de datos": mirar lo que ya pasó. El dueño bloqueado lo sigue
   * viendo — son sus números, y los necesita para decidir si paga.
   */
  it.each([
    ['el histórico de citas', proto.findAll],
    ['los servicios por cobrar', proto.getPendingCollections],
  ])('sigue viendo %s', (_caso, handler) => {
    expect(exentosDe(handler)).toContain('adm');
  });

  it.each([
    ['agendar una cita', proto.createSessionWithDetail],
    ['cobrar una cita', proto.registerSessionPayment],
  ])('NO puede: %s', (_caso, handler) => {
    expect(exentosDe(handler)).not.toContain('adm');
  });
});

describe('el trabajador con el salón bloqueado', () => {
  const proto = SessionController.prototype;

  it.each([
    ['su historial de citas', proto.getMyHistoryAsWorker],
    ['sus servicios asignados', proto.getMyAssignedServices],
    ['lo que ganó', proto.getMyIncomeReport],
  ])('sigue viendo %s', (_caso, handler) => {
    expect(exentosDe(handler)).toContain('wrk');
  });

  /**
   * La lista de clientes es del SALÓN, no del trabajador: es el activo que el
   * dueño está dejando de pagar. Y agendar es operar — una cita nueva en un
   * salón bloqueado es una cita que nadie va a poder cobrar.
   *
   * Su AGENDA cae del mismo lado: lo que ya trabajó se le muestra, lo que está
   * por venir no, porque con el salón bloqueado no se va a poder trabajar.
   */
  it.each([
    ['su agenda', proto.getMySessions],
    ['la lista de clientes', proto.getMyClientsAsWorker],
    ['agendar una cita', proto.createSessionWithDetail],
    ['reagendar una cita', proto.reschedule],
  ])('NO puede: %s', (_caso, handler) => {
    expect(exentosDe(handler)).not.toContain('wrk');
  });

  it('el controlador entero sigue marcado, así que el dueño no pasa', () => {
    const rule = Reflect.getMetadata(REQUIRES_OPERATION, SessionController) as
      | OperationRule
      | undefined;
    expect(rule).toBeDefined();
    expect(rule?.allowWhenBlocked).toEqual([]);
  });
});
