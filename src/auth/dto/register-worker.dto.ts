import { IsOptional, IsString, IsDate, Length, IsEmail, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterWorkerDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;
  
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsString()
  description?: string;
}