import { IsNotEmpty, IsOptional, IsJSON, IsNumber } from 'class-validator';

export class CreateCompanyWorkerDto {
  @IsNotEmpty()
  @IsNumber()
  workerId: number;

  /**
   * IGNORADO: el salón sale del token del dueño. Se sigue aceptando para no
   * romper a quien lo mande, pero no decide nada.
   */
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
