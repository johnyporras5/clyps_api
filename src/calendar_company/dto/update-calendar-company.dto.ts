import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateCalendarCompanyDto {
  @IsOptional()
  calendarDetail?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  companyId?: number;
}