import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCompanyCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;
}
