import { IsIn, IsOptional } from 'class-validator';
import { PLAN_IDS, type PlanId } from '../config/plans.config';

/** Filtros de GET /subscription/quote. */
export class QueryQuoteDto {
  /**
   * Plan a cotizar. Si no viene, se cotiza el plan de la suscripción actual de
   * la company (es lo que necesita la pantalla de renovación).
   */
  @IsOptional()
  @IsIn([...PLAN_IDS])
  planId?: PlanId;
}
