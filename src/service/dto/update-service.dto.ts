import { IsOptional, IsString, IsNumber, IsArray, Min, Max, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../common/enum/currency.enum';

class WorkerAssignmentDto {
  @IsNumber()
  id: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}