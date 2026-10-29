import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  BOOKING_MODES,
  DEPOSIT_TYPES,
  type BookingMode,
  type DepositType,
} from '../booking-modes.enums';

export class BookingDepositDto {
  @IsIn(DEPOSIT_TYPES)
  type: DepositType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percent?: number | null;

  @IsOptional()
  @IsIn(['USD', 'EUR', 'VES'])
  currency?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  instructions: string;
}

export class UpdateBookingSettingsDto {
  @IsIn(BOOKING_MODES)
  mode: BookingMode;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  leadMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  holdHours: number;

  @IsBoolean()
  workersCanApprove: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingDepositDto)
  deposit?: BookingDepositDto | null;
}
