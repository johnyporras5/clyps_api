import { IsNotEmpty, IsOptional, IsEmail, IsString, Length, IsNumber,IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClientDto {

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
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsNotEmpty()
  @IsNumber()
  userId: number;
}
