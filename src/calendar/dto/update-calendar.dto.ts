import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateCalendarDto {

  @IsOptional()
  calendarDetail?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  companyWorkerId?: number;
}
