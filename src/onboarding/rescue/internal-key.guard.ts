import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * ONB-4: protege los endpoints internos de plataforma con una llave de entorno.
 *
 * La cola de rescate cruza TODOS los tenants, así que no puede quedar detrás de
 * `@Roles('adm')`: ese rol es el dueño de una barbería, y no tiene por qué ver
 * los datos de los demás. Hoy no existe un rol de superadmin de plataforma, así
 * que se usa una llave compartida (`ONBOARDING_INTERNAL_KEY`) en el header
 * `x-internal-key`. Si la variable no está configurada, el endpoint queda
 * cerrado — nunca abierto por defecto.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config
      .get<string>('ONBOARDING_INTERNAL_KEY', '')
      ?.trim();
    if (!expected) {
      throw new ForbiddenException(
        'Endpoint interno deshabilitado: falta configurar ONBOARDING_INTERNAL_KEY',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-internal-key'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || provided !== expected) {
      throw new ForbiddenException('Llave interna inválida');
    }
    return true;
  }
}
