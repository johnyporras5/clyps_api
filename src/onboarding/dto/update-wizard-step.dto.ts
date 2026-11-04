import { IsIn } from 'class-validator';
import { ONBOARDING_WIZARD_STEP_KEYS } from '../types/onboarding.types';
import type { OnboardingWizardStepKey } from '../types/onboarding.types';

export class UpdateWizardStepDto {
  @IsIn(ONBOARDING_WIZARD_STEP_KEYS)
  step: OnboardingWizardStepKey;
}
