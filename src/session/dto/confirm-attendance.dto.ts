import { IsBoolean } from 'class-validator';

/** Body de PATCH /sessions/:id/confirm-attendance. */
export class ConfirmAttendanceDto {
  /** true = confirma asistencia, false = no asistirá. */
  @IsBoolean()
  attending: boolean;
}
