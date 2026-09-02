import { SetMetadata } from '@nestjs/common';
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

/**
 * El endpoint es una acción "de operación" (crear cita, cobrar…): exige estar
 * al día, pero no una función concreta del plan.
 *
 * Las rutas SIEMPRE permitidas —reportar el pago, ver el historial, ver las
 * instrucciones— simplemente no llevan este decorador: la lista blanca del
 * ticket es "lo que no se marca", que no se puede olvidar de actualizar.
 */
export const RequiresOperationalSubscription = () =>
  SetMetadata(REQUIRES_OPERATION, true);
