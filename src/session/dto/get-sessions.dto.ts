import {
  IsOptional,
  IsIn,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
  @Max(10)
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
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const toNum = (v: unknown) => parseInt(String(v).trim(), 10);
    const arr = Array.isArray(value)
      ? value.map(toNum)
      : String(value).split(',').map(toNum);
    return arr.filter((n) => !isNaN(n));
  })
  @IsArray()
  @IsNumber({}, { each: true })
  sessionStatus?: number[];

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const toNum = (v: unknown) => parseInt(String(v).trim(), 10);
    const arr = Array.isArray(value)
      ? value.map(toNum)
      : String(value).split(',').map(toNum);
    return arr.filter((n) => !isNaN(n));
  })
  @IsArray()
  @IsNumber({}, { each: true })
  detailStatus?: number[];

  @IsOptional()
  @Type(() => Boolean)
  onlyScheduled?: boolean; // Filtrar solo citas agendadas (sessionStatus = 1)

  @IsOptional()
  @Type(() => Boolean)
  today?: boolean;
}
