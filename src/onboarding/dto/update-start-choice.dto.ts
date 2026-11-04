import { IsIn } from 'class-validator';
import { ONBOARDING_START_CHOICES } from '../types/onboarding.types';
import type { OnboardingStartChoice } from '../types/onboarding.types';

export class UpdateStartChoiceDto {
  @IsIn(ONBOARDING_START_CHOICES)
  choice: OnboardingStartChoice;
}
