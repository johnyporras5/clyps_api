/**
 * ONB-1: tipado del estado de onboarding por company (tenant).
 *
 * Los 5 pasos viven en una columna `json` (flexible para agregar pasos luego).
 * Ningún paso se marca por autorreporte del usuario: siempre se recalcula
 * leyendo el estado real del sistema (ver OnboardingService.recomputeStep).
 */

/** Pasos del checklist, en orden de presentación. */
export const ONBOARDING_STEP_KEYS = [
  'create_profile', // 1. crear cuenta y perfil
  'add_team', // 2. agregar equipo (antes de servicios, para poder asignarlos)
  'confirm_services', // 3. confirmar servicios precargados + precio/comisión
  'first_appointment', // 4. agendar primera cita
  'first_charge', // 5. cobrar primera cita (el "ajá")
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/**
 * pendiente → incompleto → completado.
 * Solo `confirm_services` usa `incomplete` (es el único con datos parciales);
 * el resto es binario, pero el enum los soporta a todos por consistencia.
 */
export type OnboardingStepStatus = 'pending' | 'incomplete' | 'completed';

export type OnboardingGlobalStatus = 'in_progress' | 'completed' | 'skipped';

export interface OnboardingStepState {
  status: OnboardingStepStatus;
  /** ISO. Última vez que ESTE paso cambió de estado. */
  updatedAt: string;
  /** Solo si `incomplete`. Ej: { prices: 8, commissions: 8 }. */
  missing?: Record<string, number>;
}

export type OnboardingSteps = Record<OnboardingStepKey, OnboardingStepState>;

/** Estado inicial: los 5 pasos en `pending`. */
export function buildInitialSteps(now: string): OnboardingSteps {
  return ONBOARDING_STEP_KEYS.reduce((acc, key) => {
    acc[key] = { status: 'pending', updatedAt: now };
    return acc;
  }, {} as OnboardingSteps);
}
