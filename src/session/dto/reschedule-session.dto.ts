import { IsOptional, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Reprogramar / mover / redimensionar una cita (CLYP-311).
 * Fechas en UTC con Z (el backend las guarda tal cual).
 */
export class RescheduleSessionDto {
  // Nuevo inicio (UTC con Z).
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDatetime?: Date;

  // Nuevo fin (UTC con Z).
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDatetime?: Date;

  // Opcional: mover a otra trabajadora (columna del calendario). Solo admin.
  @IsOptional()
  @IsNumber()
  companyWorkerId?: number;

  // Opcional: reprogramar un detalle puntual. Si no viene, se mueve la cita completa.
  @IsOptional()
  @IsNumber()
  detailId?: number;
}
