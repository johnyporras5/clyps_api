import type {
  OnboardingGlobalStatus,
  OnboardingStepKey,
  OnboardingStepStatus,
} from '../types/onboarding.types';

/** Un paso tal como lo consume el checklist del frontend. */
export interface OnboardingStepResponse {
  key: OnboardingStepKey;
  status: OnboardingStepStatus;
  /** Solo cuando `status === 'incomplete'`. Ej: { prices: 8, commissions: 8 }. */
  missing?: Record<string, number>;
}

/** Respuesta de GET /onboarding/state. */
export interface OnboardingStateResponse {
  globalStatus: OnboardingGlobalStatus;
  /** La barra de progreso SOLO cuenta pasos `completed`. */
  progress: { completed: number; total: number };
  /** En orden de presentación. */
  steps: OnboardingStepResponse[];
  firstChargeAt: string | null;
}

/** Respuesta de POST /onboarding/skip. */
export interface OnboardingSkipResponse {
  globalStatus: 'skipped';
}
