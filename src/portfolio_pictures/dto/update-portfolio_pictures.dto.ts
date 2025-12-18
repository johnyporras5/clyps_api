import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdatePortfolioPicturesDto {

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsNumber()
  workerId?: number;
}
