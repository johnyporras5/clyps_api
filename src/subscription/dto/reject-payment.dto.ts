import { IsString, Length } from 'class-validator';

/**
 * Rechazo de un pago reportado (SUB-4).
 *
 * El motivo es OBLIGATORIO: es lo que se le muestra al dueño para que sepa qué
 * corregir (SUB-9), y sin él un rechazo es indistinguible de un error.
 *
 * Quién rechaza NO viaja aquí: sale del token del administrador de plataforma.
 */
export class RejectPaymentDto {
  @IsString()
  @Length(5, 255)
  rejectionReason: string;
}
