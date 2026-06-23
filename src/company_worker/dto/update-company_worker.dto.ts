import { IsOptional, IsJSON, IsNumber } from 'class-validator';

export class UpdateCompanyWorkerDto {
  @IsOptional()
  @IsNumber()
  workerId?: number;
  @IsOptional()
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

  @IsOptional()
  @IsJSON()
  calendar?: any;
}
