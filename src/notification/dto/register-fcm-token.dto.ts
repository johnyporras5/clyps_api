import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { FcmPlatform } from '../entities/fcm-token.entity';

/** Body de POST /users/:userId/fcm-tokens (upsert por token). */
export class RegisterFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: FcmPlatform;
}
