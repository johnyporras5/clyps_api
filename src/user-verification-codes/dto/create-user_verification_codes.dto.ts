import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateUserVerificationCodesDto {
  @IsNotEmpty()
  @IsNumber()
  userId: number;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  expiresAt: Date;

  @IsOptional()
  @IsNumber()
  used?: number;
}
