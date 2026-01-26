import { RegisterBaseDto } from './register-base.dto';
import { IsOptional, IsString, IsDate, Length, } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterClientDto extends RegisterBaseDto {
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
  @IsString()
  location?: string;
}