import { IsNumber } from 'class-validator';

export class UpdateDetailStatusDto {
  @IsNumber()
  status: number;
}