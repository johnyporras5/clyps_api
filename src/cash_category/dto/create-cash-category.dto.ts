import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CASH_CATEGORY_KINDS,
  type CashCategoryKind,
} from '../cash-category.enums';

export class CreateCashCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;

  @IsIn([...CASH_CATEGORY_KINDS])
  kind: CashCategoryKind;

  // Activa por defecto si no viene.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
