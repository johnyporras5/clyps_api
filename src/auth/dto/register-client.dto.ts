import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterClientDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;

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
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;
}
