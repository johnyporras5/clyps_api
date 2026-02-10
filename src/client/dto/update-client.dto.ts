import { IsOptional, IsEmail, IsString, IsIn, IsNumber, IsArray, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;

  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  companies?: number[] = [];


}
