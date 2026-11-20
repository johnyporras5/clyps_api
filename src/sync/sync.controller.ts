import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { SyncPushDto } from './dto/sync-push.dto';
import { SyncService } from './sync.service';

/**
 * BE-OFF-5: sincronización en lote de lo que la app guardó sin red.
 *
 * El bloqueo de suscripción NO va aquí, a nivel de lote: cada operación pasa
 * por las marcas de SU endpoint suelto (crear cita lo lleva, crear cliente no).
 */
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * POST /sync/push — hasta 50 operaciones. Siempre 200 si el lote es válido:
   * el resultado de cada operación viene en `results`.
   *
   * Límite propio: 10 lotes por minuto. El global (100 peticiones/min) cuenta
   * PETICIONES y un lote son hasta 50 operaciones: sin este límite serían
   * hasta 5.000 operaciones por minuto.
   */
  @Post('push')
  @Roles('adm', 'wrk')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  push(@Request() req: AuthenticatedRequest, @Body() dto: SyncPushDto) {
    return this.syncService.push(req.user, dto.operations);
  }
}
