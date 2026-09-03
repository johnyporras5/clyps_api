import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PLAN_IDS, type PlanId } from '../config/plans.config';

/**
 * Cuerpo de POST /subscription/payments/checkout (SUB-10).
 *
 * Emite el documento de cobro en Cobrix. El monto NO viaja en el cuerpo: lo
 * calcula el servidor con el plan y la tasa del momento, igual que la
 * cotización — un monto que manda el cliente es un cobro que el cliente decide.
 */
export class StartCheckoutDto {
  /** Plan a cobrar. Si no viene, el de la suscripción vigente. */
  @IsOptional()
  @IsIn([...PLAN_IDS])
  planId?: PlanId;

  /**
   * Cédula o RIF del que paga. Cobrix resuelve al cliente por identidad fiscal
   * (`reference` en su API), así que sin esto no se puede emitir la factura.
   *
   * OPCIONAL: solo hace falta la PRIMERA vez. De ahí en más el backend reusa la
   * que ya quedó guardada, y solo se manda de nuevo para corregirla.
   *
   * Se acepta con o sin prefijo (V-12345678, 12345678, J-401234567): el formato
   * exacto lo valida Cobrix, aquí solo se limpia y se limita el largo.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'identification no puede venir vacío' })
  @MaxLength(30)
  @Matches(/^[VEJPGvejpg]?-?\d{5,12}(-?\d)?$/, {
    message: 'identification debe ser una cédula o RIF válido',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  identification?: string;
}
