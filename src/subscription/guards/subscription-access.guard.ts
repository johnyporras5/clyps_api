import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { EntitlementsService, isPlanFeature } from '../entitlements.service';
import {
  REQUIRES_FEATURE,
  REQUIRES_OPERATION,
  type OperationRule,
} from './requires-feature.decorator';
import type {
  AuthenticatedRequest,
  TenantRole,
} from '../../auth/types/authenticated-request';

/**
 * Cómo se comporta el bloqueo (SUB-12). Se cambia por variable de entorno, sin
 * tocar código ni desplegar.
 *
 * - `off`  el guard no hace nada.
 * - `log`  calcula, DEJA PASAR igual y anota a quién habría bloqueado.
 * - `on`   bloquea de verdad.
 *
 * El default es `on`: sin la variable cargada el bloqueo YA rige, que es lo que
 * se espera de SUB-12 y evita tener que acordarse de encenderlo en cada
 * entorno.
 *
 * Los otros dos no son adorno, son el freno de emergencia. Si un día hay
 * salones bloqueados que no deberían estarlo —el cálculo del acceso nunca había
 * cerrado una puerta antes de SUB-12—, cargar la variable en `off` los devuelve
 * al trabajo sin revertir código ni volver a construir. `log` es el paso
 * intermedio para investigar: no bloquea a nadie y deja en el log a quién
 * habría bloqueado, que es la lista con la que se busca el error.
 */
export type EnforcementMode = 'off' | 'log' | 'on';

const DEFAULT_MODE: EnforcementMode = 'on';

/**
 * Guard reutilizable de acceso por suscripción (SUB-5 / CLYP-338, SUB-12).
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
    private readonly config: ConfigService,
  ) {}

  private readonly logger = new Logger(SubscriptionAccessGuard.name);

  /** Modo de aplicación. Un valor desconocido cae en el default, no rompe. */
  get mode(): EnforcementMode {
    const raw = this.config
      .get<string>('SUBSCRIPTION_ENFORCEMENT')
      ?.trim()
      .toLowerCase();
    return raw === 'off' || raw === 'log' || raw === 'on' ? raw : DEFAULT_MODE;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<unknown>(
      REQUIRES_FEATURE,
      [context.getHandler(), context.getClass()],
    );
    const operation = this.reflector.getAllAndOverride<OperationRule>(
      REQUIRES_OPERATION,
      [context.getHandler(), context.getClass()],
    );
    if (!feature && !operation) return true;

    const mode = this.mode;
    if (mode === 'off') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Sesión no válida');

    // El cliente final y el admin de plataforma no pertenecen a UN salón: el
    // token del cliente viaja sin `companyId` a propósito (es cliente de varios)
    // y el de la plataforma cruza todos. Sin este corte, el cliente recibiría
    // "No tienes una compañía asignada" al reservar en un salón AL DÍA, que no
    // tiene nada que ver con el bloqueo. Lo suyo se decide donde sí se sabe el
    // salón: `SessionService.createSessionByClient`.
    if (user.userType === 'cli' || user.userType === 'padm') return true;

    // Exento por rol en ESTE endpoint (la nómina del trabajador, SUB-12).
    if (operation?.allowWhenBlocked?.includes(user.userType)) return true;

    const role: TenantRole = user.userType;
    // Todo lo que puede cortar va DENTRO del try, resolver la company incluida:
    // en modo `log` nadie debe quedarse afuera por culpa de este guard, ni
    // siquiera el dueño al que todavía no se le creó la company.
    try {
      // El tenant sale del token; si es un dueño sin claim, se resuelve por su
      // company.
      const companyId =
        user.companyId ??
        (user.userType === 'adm'
          ? await this.entitlements.resolveCompanyIdForAdmin(user.sub)
          : null);
      if (companyId === null)
        throw new ForbiddenException('No tienes una compañía asignada');

      if (isPlanFeature(feature)) {
        await this.entitlements.assertCanUseFeature(companyId, feature, role);
      } else {
        await this.entitlements.assertCanOperate(companyId, role);
      }
      return true;
    } catch (error) {
      if (mode === 'on') throw error;
      // Modo `log`: se anota el candidato y se deja pasar.
      this.logger.warn(
        `[enforcement=log] el usuario ${user.sub} (rol ${role}, company ` +
          `${user.companyId ?? 'sin claim'}) habría sido bloqueado en ` +
          `${request.method} ${request.originalUrl ?? request.url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      return true;
    }
  }
}
