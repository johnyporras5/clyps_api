import { IsNumber, IsOptional } from 'class-validator';

export class UpdateSessionStatusDto {
  @IsNumber()
  sessionStatus: number;

  @IsOptional()
  @IsNumber()
  detailId?: number;
}