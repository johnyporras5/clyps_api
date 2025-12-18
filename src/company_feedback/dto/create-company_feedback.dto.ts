import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class CreateCompanyFeedbackDto {

  @IsOptional()
  @IsNumber()
  stars?: number;

  @IsOptional()
  datetime?: Date;

  @IsOptional()
  @IsNumber()
  companyId?: number;

  @IsOptional()
  @IsNumber()
  clientId?: number;
}
