import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateServiceCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
