import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateServiceCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;
}