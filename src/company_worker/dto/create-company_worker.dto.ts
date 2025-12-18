import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class CreateCompanyWorkerDto {

  @IsNotEmpty()
  @IsNumber()
  workerId: number;

  @IsNotEmpty()
  @IsNumber()
  companyId: number;

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
