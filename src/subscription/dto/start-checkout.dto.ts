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
import { IDENTIFICATION_FORMAT_MESSAGE } from '../subscription-identification.util';

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
   * La LETRA es obligatoria. Se acepta escrita de cualquier forma —`v12345678`,
   * `V-12.345.678`— y el servicio la lleva a `V-12345678`, pero sin ella no se
   * adivina: `12345678` puede ser la cédula V-12345678 o el RIF J-12345678, y
   * Cobrix resuelve al cliente por ahí. Elegir mal le factura a otro.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'identification no puede venir vacío' })
  @MaxLength(30)
  @Matches(/^[VEJPG][\s._-]?\d{6,10}([\s._-]?\d)?$/, {
    message: IDENTIFICATION_FORMAT_MESSAGE,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  identification?: string;
}
