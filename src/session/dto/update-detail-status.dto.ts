import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateDetailStatusDto {
  @IsNumber()
  status: number;

  /**
   * Solo aplica al Comenzar (2) / Terminar (3). true = el botón se pulsó tarde
   * pero el servicio SÍ ocurrió a su hora pautada: se conserva el horario (no
   * se registra la hora de la petición), no se arrastran las citas siguientes
   * y no se envían correos/notificaciones de reprogramación.
   */
  @IsOptional()
  @IsBoolean()
  keepOriginalSchedule?: boolean;

  // Motivo de cancelación — opcional, solo se guarda cuando status = 5 (Cancelado)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
