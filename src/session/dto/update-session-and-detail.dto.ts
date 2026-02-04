import { IsOptional, IsDateString, IsNotEmpty, IsNumber } from 'class-validator';

export class UpdateSessionDto {
  @IsOptional()
  @IsDateString()
  sessionDatetime?: string;

  @IsOptional()
  @IsDateString()
  detailStartDatetime?: string;
  

  @IsNotEmpty()
  @IsNumber()
  detailId: number;
}