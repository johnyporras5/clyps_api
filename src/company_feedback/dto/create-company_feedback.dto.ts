import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class CreateCompanyFeedbackDto {
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
}
