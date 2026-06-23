import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdatePortfolioPicturesDto {
  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsNumber()
  workerId?: number;
}
