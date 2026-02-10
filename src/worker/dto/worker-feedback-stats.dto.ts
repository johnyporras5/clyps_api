// dto/worker-feedback-stats.dto.ts
import { IsOptional, IsNumber } from 'class-validator';

export class WorkerFeedbackStatsDto {
  @IsOptional()
  @IsNumber()
  averageStars?: number;

  @IsOptional()
  @IsNumber()
  totalFeedbacks?: number;

  @IsOptional()
  @IsNumber()
  fiveStarCount?: number;

  @IsOptional()
  @IsNumber()
  fourStarCount?: number;

  @IsOptional()
  @IsNumber()
  threeStarCount?: number;

  @IsOptional()
  @IsNumber()
  twoStarCount?: number;

  @IsOptional()
  @IsNumber()
  oneStarCount?: number;
}