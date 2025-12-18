import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateSessionDetailDto {

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
}
