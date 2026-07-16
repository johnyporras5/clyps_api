import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class UpdateSessionStatusDto {
  @IsNumber()
  sessionStatus: number;

  /**
   * Solo aplica al Comenzar (2) / Terminar (3). true = el botón se pulsó tarde
   * pero la cita SÍ ocurrió a su hora pautada: se conserva el horario (no se
   * registra la hora de la petición), no se arrastran las citas siguientes y
   * no se envían correos/notificaciones de reprogramación.
   */
  @IsOptional()
  @IsBoolean()
  keepOriginalSchedule?: boolean;

  @IsOptional()
  @IsNumber()
  detailId?: number;
}
