import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateSessionDetailDto {
  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  serviceId?: number;

  @IsOptional()
  @IsNumber()
  companyWorkerId?: number;

  @IsOptional()
  @IsNumber()
  sessionId?: number;

  @IsOptional()
  startDatetime?: Date;

  @IsOptional()
  @IsNumber()
  totalTime?: number;

  @IsOptional()
  @IsNumber()
  totalWorker?: number;

  @IsOptional()
  @IsNumber()
  totalCompany?: number;

  @IsOptional()
  @IsNumber()
  status?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionIA?: string;
}
