import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Length,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkerDto {
  @IsNotEmpty()
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;
}
