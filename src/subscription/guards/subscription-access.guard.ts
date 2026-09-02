import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService, isPlanFeature } from '../entitlements.service';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';

/**
 * Guard reutilizable de acceso por suscripción (SUB-5 / CLYP-338).
 *
 * Se pone DESPUÉS de `JwtAuthGuard` (necesita `req.user`) y decide con
 * `EntitlementsService`, que es la única puerta: aquí no se lee ni el plan ni el
 * estado por cuenta propia.
 *
 * Un endpoint sin `@RequiresFeature` ni `@RequiresOperationalSubscription` pasa
 * de largo: así las rutas de pago e historial siguen abiertas incluso con el
 * tenant bloqueado, sin mantener una lista blanca aparte que se desactualice.
 *
 * La metadata se lee del handler Y de la clase, para poder marcar un controlador
 * entero (a diferencia del RolesGuard del proyecto, que solo mira el handler).
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<unknown>(
      'subscription:requires-feature',
      [context.getHandler(), context.getClass()],
    );
    const requiresOperation = this.reflector.getAllAndOverride<boolean>(
      'subscription:requires-operation',
      [context.getHandler(), context.getClass()],
    );
    if (!feature && !requiresOperation) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Sesión no válida');

    // El tenant sale del token; si es un dueño sin claim, se resuelve por su
    // company. Los roles que no pertenecen a un salón no pasan por aquí.
    const companyId =
      user.companyId ??
      (user.userType === 'adm'
        ? await this.entitlements.resolveCompanyIdForAdmin(user.sub)
        : null);
    if (companyId === null)
      throw new ForbiddenException('No tienes una compañía asignada');

    if (isPlanFeature(feature)) {
      await this.entitlements.assertCanUseFeature(companyId, feature);
      return true;
    }

    await this.entitlements.assertCanOperate(companyId);
    return true;
  }
}
