import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber } from 'class-validator';

export class CreateWorkerFeedbackDto {

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
