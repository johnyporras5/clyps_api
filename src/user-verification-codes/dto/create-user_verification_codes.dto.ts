import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

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
