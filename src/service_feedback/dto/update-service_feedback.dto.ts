import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';

export class UpdateServiceFeedbackDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
