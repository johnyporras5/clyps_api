import { IsOptional, IsString } from 'class-validator';

export class SuggestionsDto {
  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @IsOptional()
  @IsString()
  serviceCategory?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  style?: string;
}
