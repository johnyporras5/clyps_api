import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateClientDto {

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsNumber()
  userId?: number;
}
