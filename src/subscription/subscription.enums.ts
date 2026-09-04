/**
 * Tipos de dominio de suscripciones y pagos (SUB-1 / CLYP-333).
 *
 * Se guardan como `varchar` en la BD (no enum nativo) siguiendo la convención
 * del proyecto — igual que `cash_transaction.kind` o `payroll_concept.type`. El
 * valor lo respalda un CHECK en la migración; la validación de entrada vivirá
 * en los DTOs (class-validator) cuando lleguen los endpoints.
 */

/**
 * Estado de acceso de la suscripción.
 * - `trialing`: prueba de 15 días, nace aquí al iniciar onboarding.
 * - `active`: período pagado vigente.
 * - `grace`: venció el período y corre la gracia (5 días) antes de bloquear.
 * - `blocked`: sin acceso hasta que reporte y se le verifique un pago.
 */
export type SubscriptionStatus = 'trialing' | 'active' | 'grace' | 'blocked';
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'grace',
  'blocked',
];

/**
 * Cómo dice el tenant que pagó. Los tres comparten el mismo flujo de
 * verificación (SUB-3 / SUB-4); lo que cambia es la moneda del monto y qué
 * datos del pagador acompañan al reporte.
 */
export type PaymentMethod = 'pago_movil' | 'binance' | 'paypal';
export const PAYMENT_METHODS: PaymentMethod[] = [
  'pago_movil',
  'binance',
  'paypal',
];

/**
 * Ciclo de vida del reclamo de pago. `reported` es solo lo que AFIRMA el
 * tenant: no da acceso por sí solo, hace falta `verified`.
 */
export type PaymentReportStatus = 'reported' | 'verified' | 'rejected';
export const PAYMENT_REPORT_STATUSES: PaymentReportStatus[] = [
  'reported',
  'verified',
  'rejected',
];

/** Quién resolvió el reporte: el conciliador automático o una persona. */
export type VerificationMethod = 'auto' | 'manual';
export const VERIFICATION_METHODS: VerificationMethod[] = ['auto', 'manual'];

/** Momento del ciclo al que apunta un recordatorio enviado. */
export type ReminderTier = 'd-7' | 'd-3' | 'd-1' | 'd0' | 'grace';
export const REMINDER_TIERS: ReminderTier[] = [
  'd-7',
  'd-3',
  'd-1',
  'd0',
  'grace',
];

/** Canal por el que salió el recordatorio. */
export type ReminderChannel = 'in_app' | 'email' | 'whatsapp';
export const REMINDER_CHANNELS: ReminderChannel[] = [
  'in_app',
  'email',
  'whatsapp',
];

/**
 * Resultado de la conciliación automática con Cobrix (SUB-10).
 *
 * Es una dimensión APARTE de `PaymentReportStatus`: dice qué contestó el
 * conciliador, no si el pago está cobrado. Un `rejected` de Cobrix NO rechaza
 * el reporte — lo deja en `reported` con esta marca para que el admin lo cierre
 * a mano (SUB-4).
 *
 * - `pending`: enviado/esperando el webhook de Cobrix.
 * - `approved`: Cobrix confirmó el pago; el reporte quedó `verified`/`auto`.
 * - `rejected`: Cobrix no lo dio por bueno → revisión manual.
 * - `unsupported`: método que Cobrix no concilia (Binance/PayPal) → manual.
 * - `expired`: se agotó la espera del webhook → manual.
 */
export type AutoCheckStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'unsupported'
  | 'expired';
export const AUTO_CHECK_STATUSES: AutoCheckStatus[] = [
  'pending',
  'approved',
  'rejected',
  'unsupported',
  'expired',
];

/** Los estados de `auto_check_status` que caen en la cola manual (SUB-4). */
export const AUTO_CHECK_NEEDS_REVIEW: AutoCheckStatus[] = [
  'rejected',
  'unsupported',
  'expired',
];
