import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { OFFER_IDS, type OfferId } from '../config/offers.config';
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

  /**
   * Promo Black Friday: qué oferta se quiere. Solo el id —el precio lo pone el
   * servidor—. Se revisa que el salón tenga derecho (`PromoService`).
   */
  @IsOptional()
  @IsIn([...OFFER_IDS])
  offerId?: OfferId;

  /** Pasarse de la promo Básico a Full pagando la diferencia. */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  upgrade?: boolean;
}
