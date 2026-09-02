import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // Verificar si el usuario tiene al menos uno de los roles requeridos
    const hasRole = requiredRoles.some((role) => user.userType === role);

    if (!hasRole) {
      // Obtener el nombre del rol requerido para el mensaje personalizado
      // En plural desde el catálogo: antes se formaba pegándole una "s" al
      // singular y salía "Solo administradors pueden acceder a este recurso".
      const roleNames = {
        adm: 'administradores',
        wrk: 'trabajadores',
        cli: 'clientes',
        padm: 'administradores de la plataforma',
      };

      const requiredRoleNames = requiredRoles.map(
        (role) => roleNames[role] || role,
      );

      throw new ForbiddenException(
        `Solo ${requiredRoleNames.join(' o ')} pueden acceder a este recurso`,
      );
    }

    return true;
  }
}
