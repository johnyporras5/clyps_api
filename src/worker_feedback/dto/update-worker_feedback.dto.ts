import { IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateWorkerFeedbackDto {

  @IsOptional()
  @IsNumber()
  stars?: number;

  @IsOptional()
  datetime?: Date;

  @IsOptional()
  @IsNumber()
  workerId?: number;

  @IsOptional()
  @IsNumber()
  clientId?: number;
}
