import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';

export class UpdateCompanyFeedbackDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

