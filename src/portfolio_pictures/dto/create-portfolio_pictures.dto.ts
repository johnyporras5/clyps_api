import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class CreatePortfolioPicturesDto {

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsNumber()
  workerId?: number;
}
