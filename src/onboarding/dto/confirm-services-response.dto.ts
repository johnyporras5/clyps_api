import type { OnboardingStepStatus } from '../types/onboarding.types';

/** Respuesta de POST /onboarding/services/confirm. */
export interface ConfirmServicesResponse {
  createdCategories: number;
  createdServices: number;
  /** Categorías + servicios que ya existían y se actualizaron en vez de duplicar. */
  skippedDuplicates: number;
  /** Lo que quedó sin definir, contado sobre TODOS los servicios activos. */
  pending: {
    servicesWithoutPrice: number;
    servicesWithoutCommission: number;
  };
  /** Estado del paso tal como quedó persistido (ONB-1). */
  onboardingStep: {
    key: 'confirm_services';
    status: OnboardingStepStatus;
    missing?: { prices: number; commissions: number };
  };
}
