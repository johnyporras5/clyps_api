import { IsOptional, IsString, IsInt, ValidateIf } from 'class-validator';

export class ProcessPromptDto {
  @IsOptional()
  @IsInt()
  @ValidateIf((o) => !o.text)
  id?: number;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.id)
  text?: string;
}
