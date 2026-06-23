import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';
import { DeleteFcmTokenDto } from './dto/delete-fcm-token.dto';

/**
 * Registro/baja de tokens FCM (CLYP-258 / §2).
 *
 * La ruta lleva :userId por compatibilidad con el cliente, pero el dueño real
 * SIEMPRE es el del token JWT (req.user.sub) para que nadie registre tokens a
 * nombre de otro usuario.
 */
@Controller('users/:userId/fcm-tokens')
@UseGuards(JwtAuthGuard)
export class FcmTokenController {
  constructor(private readonly notificationService: NotificationService) {}

  /** POST → upsert por token (si existe, actualiza userId/platform). */
  @Post()
  @HttpCode(HttpStatus.OK)
  register(@Req() req: any, @Body() dto: RegisterFcmTokenDto) {
    return this.notificationService.upsertToken(
      req.user.sub,
      dto.token,
      dto.platform,
    );
  }

  /** DELETE → elimina ese token (se llama en logout). */
  @Delete()
  @HttpCode(HttpStatus.OK)
  remove(@Req() req: any, @Body() dto: DeleteFcmTokenDto) {
    return this.notificationService.deleteToken(req.user.sub, dto.token);
  }
}
