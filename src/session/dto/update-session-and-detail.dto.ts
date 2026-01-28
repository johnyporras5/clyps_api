import { IsOptional, IsNumber, IsDateString, IsNotEmpty } from 'class-validator';

export class UpdateSessionDto {
  @IsOptional()
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @IsDateString()
  sessionDatetime?: string;

  @IsOptional()
  @IsNumber()
  sessionStatus?: number;

  @IsNotEmpty()
  @IsNumber()
  serviceId?: number; 

  @IsNotEmpty()
  @IsNumber()
  companyWorkerId?: number; 

  @IsOptional()
  @IsNumber()
  detailStatus?: number;

  @IsNotEmpty()
  @IsNumber()
  detailId: number; 
}