import { IsOptional, IsIn, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSessionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1; 

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 10; 

  @IsOptional()
  @IsIn(['recent', 'oldest', 'priority'])
  orderBy?: 'recent' | 'oldest' | 'priority';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sessionStatus?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  detailStatus?: number; 
}