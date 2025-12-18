import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class CreateServiceDto {

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsNumber()
  standardTime?: number;

  @IsOptional()
  @IsNumber()
  companyId?: number;
}
