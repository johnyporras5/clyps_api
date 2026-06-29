import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateIAPromptDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 5, { message: 'type must be between 1 and 5 characters' })
  type: string; // 'c', 'p' o 'pg'
}
