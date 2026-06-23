import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateUserVerificationCodesDto {
  @IsNumber()
  userId?: number;

  @IsString()
  code?: string;

  expiresAt?: Date;

  @IsOptional()
  @IsNumber()
  used?: number;
}
