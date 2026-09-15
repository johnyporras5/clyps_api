import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ImpersonationService } from './services/impersonation.service';
import { StartImpersonationDto } from './dto/start-impersonation.dto';
import { ExchangeImpersonationTicketDto } from './dto/exchange-impersonation-ticket.dto';
import type { AuthenticatedRequest } from './types/authenticated-request';

/** La IP real detrás del proxy (Nginx / DigitalOcean), si la hay. */
function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  // `X-Forwarded-For` llega como "cliente, proxy1, proxy2": el primero es el
  // navegador. Es un dato de auditoría, no una credencial: quien manda la
  // cabecera puede mentir, así que se guarda como pista y nunca se decide nada
  // con ella.
  const ip = raw ? raw.split(',')[0].trim() : req.ip;
  return ip ? ip.slice(0, 45) : null;
}

/**
 * Lo que usa el PANEL de la plataforma: abrir accesos, verlos y cortarlos.
 *
 * `@Roles('padm')` va repetido en cada método y no en la clase. No es
 * despiste: el RolesGuard lee la metadata solo del handler
 * (ver roles.guard.ts → `reflector.get('roles', context.getHandler())`), así
 * que a nivel de clase se ignoraría EN SILENCIO y cualquier usuario
 * autenticado —el dueño de un salón incluido— podría abrirse un acceso a
 * cualquier otro salón. Es el peor fallo posible de este archivo.
 */
@Controller('admin/impersonation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  /**
   * POST /admin/impersonation — "Acceder" en el panel.
   * Devuelve un vale de un solo uso y la URL a la que abrir la pestaña.
   */
  @Roles('padm')
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Body() dto: StartImpersonationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impersonation.start(
      req.user,
      dto.companyId,
      clientIp(req),
      req.headers['user-agent'] ?? null,
    );
  }

  /** GET /admin/impersonation — sesiones abiertas ahora mismo. */
  @Roles('padm')
  @Get()
  async listActive() {
    return this.impersonation.listActive();
  }

  /**
   * DELETE /admin/impersonation/:id — cortar una sesión ya entregada.
   *
   * Cualquier `padm` puede cortar la de cualquier otro: si un acceso se está
   * usando mal, quien lo ve tiene que poder pararlo sin buscar a su dueño.
   */
  @Roles('padm')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id', ParseIntPipe) id: number) {
    return this.impersonation.revoke(id);
  }
}

/**
 * Lo que usa la APP DEL SALÓN. Vive aparte del controlador de arriba porque el
 * canje no puede exigir token: el vale ES la credencial, y quien lo presenta
 * todavía no tiene sesión de nada.
 */
@Controller('auth/impersonation')
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  /**
   * POST /auth/impersonation/exchange — vale por token.
   *
   * Sin guard a propósito, pero con freno: es el único sitio del sistema donde
   * un secreto de 32 bytes abre una sesión, así que se limitan los intentos
   * por IP igual que en el login. Adivinar el vale es inviable; el límite está
   * para que ni siquiera se pueda intentar a lo bestia.
   */
  @Post('exchange')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: ExchangeImpersonationTicketDto) {
    return this.impersonation.exchange(dto.ticket);
  }

  /**
   * POST /auth/impersonation/end — "Salir" desde el aviso de la app.
   *
   * La sesión a cerrar sale del claim `imp` del token, NUNCA del cuerpo de la
   * petición: si el id viniera de fuera, cualquiera con una sesión válida
   * podría cerrarle el acceso a otro operador cambiando un número.
   */
  @Post('end')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async end(@Req() req: AuthenticatedRequest) {
    const sessionId = req.user.imp;
    if (!sessionId) {
      // No es un error del servidor: es una sesión normal pidiendo salir de
      // una suplantación que no existe. Se responde sin romper nada.
      return { message: 'Esta sesión no es un acceso de soporte.' };
    }
    return this.impersonation.endOwn(sessionId);
  }
}
