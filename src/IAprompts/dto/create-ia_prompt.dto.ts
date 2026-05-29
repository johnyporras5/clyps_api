import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateIAPromptDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 1, { message: 'type must be exactly 1 character' })
  type: string; // 'p' o 'c'
}
