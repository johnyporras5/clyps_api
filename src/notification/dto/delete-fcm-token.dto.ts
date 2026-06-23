import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body de DELETE /users/:userId/fcm-tokens (se llama en logout). */
export class DeleteFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
