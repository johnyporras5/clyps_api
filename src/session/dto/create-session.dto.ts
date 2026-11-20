import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsNumber()
  clientId?: number;

  @IsOptional()
  sessionDatetime?: Date;

  @IsOptional()
  @IsNumber()
  sessionStatus?: number;

  @IsOptional()
  @IsNumber()
  totalCost?: number;

  @IsOptional()
  @IsNumber()
  totalTime?: number;

  @IsOptional()
  iaResponse?: any;

  @IsOptional()
  startDatetime?: Date;

  @IsOptional()
  @IsNumber()
  status?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionIA?: string;

  /**
   * BE-OFF-3. Uso INTERNO: lo llena createSessionWithDetail ya validado. Sin
   * decoradores a propósito: el ValidationPipe (whitelist) no lo acepta en el
   * body de POST /sessions.
   */
  createdOfflineAt?: Date | null;
}
