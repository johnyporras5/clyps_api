import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateCompanyWorkerDto {

  @IsNumber()
  workerId?: number;

  @IsNumber()
  companyId?: number;

  @IsOptional()
  @IsNumber()
  isActive?: number;

  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;

  @IsOptional()
  servicesDetail?: any;

  @IsOptional()
  @IsNumber()
  userId?: number;
}
