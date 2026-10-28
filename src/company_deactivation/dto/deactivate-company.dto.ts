import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Desactivar un salón desde el panel. El motivo es opcional pero se guarda
 * para que dentro de seis meses se sepa por qué (falta de pago, pidió la baja,
 * cuenta duplicada…).
 *
 * Quién desactiva NO viaja aquí: sale del token del administrador.
 */
export class DeactivateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
