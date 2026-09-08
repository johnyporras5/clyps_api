import { IsIn } from 'class-validator';
import { PLAN_IDS, type PlanId } from '../config/plans.config';

/** Plan que el dueño elige en la pantalla "Elige tu plan" (SUB-11 / CLYP-367). */
export class ChoosePlanDto {
  @IsIn([...PLAN_IDS])
  planId: PlanId;
}
