import { IsOptional, IsString, IsNumber, IsArray, Min, Max, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../common/enum/currency.enum';

class WorkerAssignmentDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;


  @IsOptional()
  @IsNumber()
  @Min(0)
  time?: number;


}

export class CreateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsNumber()
  standardTime?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerAssignmentDto)
  workers?: WorkerAssignmentDto[];

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number; // Porcentaje general del servicio

  @IsOptional()
  @IsNumber()
  status?: number;

  @IsOptional()
  @IsNumber()
  categoryId?: number;


}