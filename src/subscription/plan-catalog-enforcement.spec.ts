/* eslint-disable @typescript-eslint/unbound-method --
 * Los handlers se leen como VALOR: la metadata de los decoradores de Nest vive
 * colgada de la propia función. No hay `this` que pueda perderse.
 */

// `uuid` se publica como ESM y jest no lo transforma; importar un controlador
// arrastra media aplicación hasta llegar a él.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { PayrollController } from '../payroll/payroll.controller';
import { ReportsController } from '../reports/reports.controller';
import { CashProfitabilityController } from '../cash_transaction/cash-profitability.controller';
import { IAPromptsController } from '../IAprompts/ia_prompts.controller';
import { REQUIRES_FEATURE } from './guards/requires-feature.decorator';
import { PLAN_FEATURES, type PlanFeature } from './entitlements.service';
import { PLANS } from './config/plans.config';

/**
 * SUB-14: el catálogo de planes se RESPETA.
 *
 * Antes de esta tanda, `plans.config.ts` decía que el Básico no incluye nómina,
 * análisis, IA ni app del equipo... y ninguna de esas cuatro banderas estaba
 * enganchada a nada: el decorador `@RequiresFeature` existía sin un solo uso.
 * El catálogo era un folleto, no una regla.
 *
 * Esta prueba lee la metadata en vez de levantar el módulo porque lo que puede
 * romperse es justamente eso: que alguien borre un decorador al refactorizar y
 * no se entere hasta que un salón de $15 esté usando el producto de $28.
 */

const featureDe = (target: unknown): PlanFeature | undefined =>
  Reflect.getMetadata(REQUIRES_FEATURE, target as object) as
    | PlanFeature
    | undefined;

describe('cada función del Full está enganchada a su puerta', () => {
  it.each([
    ['la nómina', PayrollController, 'payroll'],
    ['Análisis de datos', ReportsController, 'analytics'],
    ['Rentabilidad', CashProfitabilityController, 'analytics'],
  ])('%s exige su función del plan', (_caso, controller, feature) => {
    expect(featureDe(controller)).toBe(feature);
  });

  it.each([
    ['la consulta', IAPromptsController.prototype.processPrompt],
    ['la consulta en vivo', IAPromptsController.prototype.processPromptStream],
  ])('la IA del profesional (%s) exige su función', (_caso, handler) => {
    expect(featureDe(handler)).toBe('aiSuggestions');
  });
});

/**
 * Lo que queda FUERA, y por qué. Si mañana alguien suma una bandera al
 * catálogo, esta lista lo obliga a decidir dónde se aplica en vez de dejarla
 * suelta como estuvieron las cuatro anteriores.
 */
describe('el inventario de funciones no tiene huecos silenciosos', () => {
  const ENGANCHADAS: PlanFeature[] = [
    'payroll',
    'analytics',
    'aiSuggestions',
    // No lleva decorador: el guard se la exige a TODO trabajador, en cualquier
    // puerta marcada. Marcar endpoint por endpoint se olvida uno.
    'workerApp',
  ];

  const SIN_PUERTA: PlanFeature[] = [
    // Está en los DOS planes: no hay nada que cortar.
    'clientApp',
    // No es software: es cómo se responde un correo.
    'prioritySupport',
  ];

  it('toda función del catálogo está enganchada o justificada', () => {
    expect([...ENGANCHADAS, ...SIN_PUERTA].sort()).toEqual(
      [...PLAN_FEATURES].sort(),
    );
  });

  it('las que no tienen puerta es porque el Básico también las trae', () => {
    for (const feature of SIN_PUERTA) {
      if (feature === 'prioritySupport') continue;
      expect(PLANS.basico.limits[feature]).toBe(true);
    }
  });

  it('las enganchadas son justo las que el Básico NO trae', () => {
    for (const feature of ENGANCHADAS) {
      expect(PLANS.basico.limits[feature]).toBe(false);
      expect(PLANS.full.limits[feature]).toBe(true);
    }
  });
});
