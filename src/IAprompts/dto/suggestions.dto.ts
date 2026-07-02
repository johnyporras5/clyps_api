import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SuggestionsDto {
  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @IsOptional()
  @IsString()
  serviceCategory?: string;
}
