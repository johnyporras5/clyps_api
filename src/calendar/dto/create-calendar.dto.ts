import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateCalendarDto {
  @IsOptional()
  calendarDetail?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  companyWorkerId?: number;
}
