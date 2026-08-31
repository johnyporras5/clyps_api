/**
 * Catálogo de planes (SUB-1 / CLYP-333).
 *
 * Los planes viven en código, NO en base de datos: son pocos, cambian poco y su
 * precio y límites son una decisión de producto, no un dato que el tenant edite.
 * Cambiar un precio o un entitlement es un deploy, no un UPDATE.
 *
 * Núcleo disponible en AMBOS planes (no se restringe al plan caro): agenda y
 * panel de citas, servicios/categorías/ofertas, clientes, cobro de citas,
 * reseñas y la app del cliente final.
 *
 * Multi-sede queda FUERA de v1: por eso no existe `maxLocations` (implícito: 1
 * sede). Cuando exista será un entitlement nuevo.
 */

export type PlanId = 'basico' | 'full';

export interface PlanLimits {
  /** Tope de trabajadores del salón. */
  maxWorkers: number;
  /** Nómina y comisiones automáticas. */
  payroll: boolean;
  /** Análisis de datos: ingresos, movimiento de clientes, por cobrar. */
  analytics: boolean;
  /**
   * Sugerencia de estilo con IA. Vive DENTRO de la app del cliente final, que
   * está en ambos planes: en un salón Básico la app funciona normal pero la
   * sugerencia no se muestra (al cliente final NO se le pinta candado; el
   * anzuelo de upgrade se le muestra al dueño en su panel).
   */
  aiSuggestions: boolean;
  /** App nativa para los trabajadores. */
  workerApp: boolean;
  /** App nativa del cliente final. En AMBOS planes. */
  clientApp: boolean;
  prioritySupport: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /**
   * Base de precio en centavos de USD. El monto en Bs NO se guarda aquí: se
   * cotiza al abrir el pago y se congela dentro del PaymentReport (SUB-2).
   */
  priceUsdMinor: number;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  // Básico "Ordena tu día" — el core que engancha, para el salón pequeño.
  basico: {
    id: 'basico',
    name: 'Básico',
    priceUsdMinor: 1500,
    limits: {
      maxWorkers: 2,
      payroll: false,
      analytics: false,
      aiSuggestions: false,
      workerApp: false,
      clientApp: true,
      prioritySupport: false,
    },
  },
  // Full "Controla y haz crecer tu negocio" — automatización + app del equipo.
  full: {
    id: 'full',
    name: 'Full',
    priceUsdMinor: 2800,
    limits: {
      maxWorkers: 20,
      payroll: true,
      analytics: true,
      aiSuggestions: true,
      workerApp: true,
      clientApp: true,
      prioritySupport: true,
    },
  },
};

export const PLAN_IDS: PlanId[] = Object.keys(PLANS) as PlanId[];

/** Días de prueba al iniciar el onboarding. Sin pedir tarjeta. */
export const TRIAL_DAYS = 15;

/** Días de gracia tras vencer el período pagado, antes de bloquear. */
export const GRACE_DAYS = 5;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value);
}

/** Plan por id. Lanza si el id no existe: un plan desconocido es un bug. */
export function getPlan(planId: PlanId): Plan {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Plan desconocido: ${String(planId)}`);
  return plan;
}
