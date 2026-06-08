import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Parámetros para consultar los rangos ocupados (disponibilidad) de una
 * compañía en un día concreto. Pensado para el rol cliente: devuelve solo
 * las franjas ocupadas, sin datos personales de otros clientes.
 */
export class GetAvailabilityDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  companyId: number;

  // Día a consultar en formato YYYY-MM-DD (acepta también ISO completo)
  @IsNotEmpty()
  @IsDateString()
  date: string;

  // Opcional: si llega, solo se consideran las citas de ese trabajador
  // más las citas sin trabajador asignado (nivel company).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyWorkerId?: number;
}
