import { IsNotEmpty, IsNumber, IsString, Min, Max } from 'class-validator';

export class CreateWorkerFeedbackDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  stars: number;

  @IsNotEmpty()
  @IsString()
  description: string;
}
