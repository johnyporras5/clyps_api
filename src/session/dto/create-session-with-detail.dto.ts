import { IsOptional, IsNumber, IsNotEmpty, IsArray, ValidateNested,IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SessionDetailItemDto {
  @IsNotEmpty()
  @IsNumber()
  serviceId: number;

  @IsNotEmpty()
  @IsNumber()
  companyWorkerId: number;

  
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionIA?: string;

  @IsOptional()
  detailStartDatetime?: Date;

  @IsOptional()
  @IsNumber()
  detailStatus?: number;

  @IsOptional()
  @IsNumber()
  offerId?: number;
}

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
  iaResponse?: any;

  @IsOptional()
  startDatetime?: Date;

  @IsOptional()
  @IsNumber()
  status?: number;

  // Array de detalles de servicios
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDetailItemDto)
  details: SessionDetailItemDto[];

  @IsOptional()
  @IsString()
  description?: string; 

  @IsOptional()
  @IsString()
  descriptionIA?: string; 
}