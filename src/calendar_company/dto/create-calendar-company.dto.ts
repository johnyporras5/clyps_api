import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateCalendarCompanyDto {
  @IsOptional()
  calendarDetail?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsNumber()
  companyId: number;
}
