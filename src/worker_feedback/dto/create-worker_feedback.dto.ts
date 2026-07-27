import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class CreateWorkerFeedbackDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  stars: number;

  @IsOptional()
  @IsString()
  description?: string;

  // Sesión a la que pertenece la calificación. Si se envía, el backend marca
  // la sesión como RATED (sessionStatus = 6) para que no vuelva a aparecer
  // en el listado de "sesiones pendientes de calificar".
  @IsOptional()
  @IsNumber()
  sessionId?: number;

  // Vía segura (POST /workerfeedbacks): el trabajador tal como viene en las
  // respuestas de sesión. El backend resuelve el worker.id real y verifica que
  // atendió la cita (sessionId). Es el dato que el front sí tiene garantizado.
  @IsOptional()
  @IsNumber()
  companyWorkerId?: number;
}
