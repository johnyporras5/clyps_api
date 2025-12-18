import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateCompanyFeedbackDto {

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
