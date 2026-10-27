import { IsString, Length } from 'class-validator';

export class RevertCashClosingDto {
  @IsString()
  @Length(3, 255)
  reason: string;
}
