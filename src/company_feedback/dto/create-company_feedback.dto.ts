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

  // Cita a la que pertenece la calificación. OBLIGATORIO: es la clave de dedup
  // (un voto por negocio por cita). Sin ella, dos votos con session_id NULL no
  // chocarían en el índice único y se colarían duplicados.
  @IsNotEmpty()
  @IsNumber()
  sessionId: number;
}
