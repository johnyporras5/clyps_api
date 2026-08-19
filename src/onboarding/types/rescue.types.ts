import type { OnboardingStepKey } from './onboarding.types';

/**
 * ONB-4: niveles escalonados de intervención, de menor a mayor.
 *
 * `reminder` todavía no molesta a ningún humano: es un aviso automático al
 * dueño. A partir de `alert` entra el consultor.
 */
export const RESCUE_LEVELS = ['reminder', 'alert', 'risk'] as const;
export type RescueLevel = (typeof RESCUE_LEVELS)[number];

/** Umbrales en días sin avanzar de paso. Configurables por entorno. */
export interface RescueThresholds {
  /** Recordatorio automático al dueño. */
  reminder: number;
  /** Alerta al consultor para rescate humano. */
  alert: number;
  /** "En riesgo": seguimiento prioritario. */
  risk: number;
}

/** Un tenant atascado, ya clasificado. */
export interface StuckTenant {
  companyId: number;
  companyName: string;
  /** Contacto para el rescate (WhatsApp). */
  phone: string | null;
  /** Correo del dueño. */
  ownerEmail: string | null;
  ownerUserId: number | null;
  /** Primer paso sin completar: donde se trabó. */
  step: OnboardingStepKey;
  /** Días completos sin que ningún paso cambiara. */
  daysStalled: number;
  /** Cuántos de los 5 pasos lleva completos. */
  completedSteps: number;
  level: RescueLevel;
  /** Última vez que avanzó (el `updated_at` de ONB-1). */
  lastProgressAt: Date;
  startedAt: Date;
}
