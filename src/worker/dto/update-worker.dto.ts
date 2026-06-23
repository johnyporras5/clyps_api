import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsNumber,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @Length(1, 145)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]*$/, {
    message:
      'El teléfono debe contener solo números, espacios, y los caracteres: + - ( )',
  })
  @Length(8, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 245)
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
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number;

  @IsOptional()
  @IsString()
  @Length(1, 145)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  tiktokUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  facebookUrl?: string;
}
