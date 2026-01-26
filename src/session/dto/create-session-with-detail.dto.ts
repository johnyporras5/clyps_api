import { IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSessionWithDetailDto {
  // Campos de Session
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

  // Campos para SessionDetail
  @IsOptional()
  @IsNumber()
  detailCost?: number; 
  @IsNotEmpty()
  @IsNumber()
  serviceId: number;

  @IsNotEmpty()
  @IsNumber()
  companyWorkerId: number;

  @IsOptional()
  detailStartDatetime?: Date;

  @IsOptional()
  @IsNumber()
  detailTotalTime?: number;

  @IsOptional()
  @IsNumber()
  detailStatus?: number;

}