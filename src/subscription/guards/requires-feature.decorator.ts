import { SetMetadata } from '@nestjs/common';
import type { TenantRole } from '../../auth/types/authenticated-request';
import type { PlanFeature } from '../entitlements.service';

export const REQUIRES_FEATURE = 'subscription:requires-feature';
export const REQUIRES_OPERATION = 'subscription:requires-operation';

/**
 * El endpoint exige una función del plan (SUB-5).
 *
 * Implica también estar al día: sin poder operar no hay función que valga.
 * Ejemplo: `@RequiresFeature('payroll')` sobre los endpoints de nómina.
 */
export const RequiresFeature = (feature: PlanFeature) =>
  SetMetadata(REQUIRES_FEATURE, feature);

/** Lo que el guard lee de `@RequiresOperationalSubscription()`. */
export interface OperationRule {
  /**
   * Roles que SIGUEN entrando aunque el salón esté bloqueado (SUB-12).
   *
   * Existe por la nómina: la deuda es del dueño, y dejar al trabajador sin ver
   * lo que ganó sería cobrarle a él una cuenta que no es suya.
   */
  allowWhenBlocked: TenantRole[];
}

/**
 * El endpoint es una acción "de operación" (crear cita, cobrar…): exige estar
 * al día, pero no una función concreta del plan.
 *
 * Las rutas SIEMPRE permitidas —reportar el pago, ver el historial, ver las
 * instrucciones— simplemente no llevan este decorador: la lista blanca del
 * ticket es "lo que no se marca", que no se puede olvidar de actualizar.
 *
 * Los roles que se le pasan quedan exentos del bloqueo en ese endpoint:
 * `@RequiresOperationalSubscription('wrk')` corta al dueño y deja pasar al
 * trabajador. El cliente final (`cli`) nunca pasa por aquí —su token no
 * pertenece a un solo salón—; lo suyo se decide donde se sabe en qué salón está
 * reservando (ver `createSessionByClient`).
 */
export const RequiresOperationalSubscription = (
  ...allowWhenBlocked: TenantRole[]
) => SetMetadata(REQUIRES_OPERATION, { allowWhenBlocked } as OperationRule);
