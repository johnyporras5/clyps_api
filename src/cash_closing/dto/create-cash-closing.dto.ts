import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../common/enum/currency.enum';
import { CLOSING_METHODS, type ClosingMethod } from '../cash-closing.enums';

export class CountedCellDto {
  @IsEnum(Currency)
  currency: Currency;

  @IsIn([...CLOSING_METHODS])
  method: ClosingMethod;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor: number;
}

export class RetainedCashDto {
  @IsEnum(Currency)
  currency: Currency;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor: number;
}

export class CreateCashClosingDto {
  @IsDateString()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountedCellDto)
  counted: CountedCellDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RetainedCashDto)
  retainedCash?: RetainedCashDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
