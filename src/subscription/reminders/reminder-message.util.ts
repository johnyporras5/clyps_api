import type { ReminderTier } from '../subscription.enums';
import {
  renderSubscriptionEmail,
  type SubscriptionEmailNotice,
} from '../notifications/subscription-email.template';

/**
 * El texto del recordatorio (SUB-8 / CLYP-339).
 *
 * Pura y sin canal: produce MENSAJE + qué hacer, y la capa de entrega decide si
 * eso viaja como notificación in-app, correo o WhatsApp. Agregar un canal no
 * toca este archivo.
 *
 * Cada aviso es accionable de un toque: lleva la fecha límite, el monto en Bs,
 * los datos de Pago Móvil y el enlace al flujo de reporte. Un recordatorio que
 * obliga a buscar los datos en otra pantalla es un recordatorio que se pospone.
 */

/** A dónde paga el dueño. Sale de la configuración del entorno. */
export interface PaymentInstructions {
  /** Teléfono de Pago Móvil del salón (el nuestro, el que recibe). */
  phone: string | null;
  /** Código o nombre del banco receptor. */
  bank: string | null;
  /** Cédula o RIF del receptor. */
  identification: string | null;
  /** A nombre de quién está la cuenta. */
  holder: string | null;
  /** Enlace directo a la pantalla de reportar el pago. */
  link: string | null;
}

export interface ReminderContext {
  tier: ReminderTier;
  companyName: string;
  planName: string;
  /** Vencimiento al que apunta el aviso. */
  periodEnd: Date;
  graceEndsAt: Date;
  daysLeft: number;
  /** Monto ya legible ("22.259,77"). `null` si la tasa no se pudo consultar. */
  amountFormatted: string | null;
  currency: string;
  instructions: PaymentInstructions;
}

/**
 * Lo mínimo que la capa de entrega necesita para repartir un aviso.
 *
 * Se separa de `ReminderMessage` para que los avisos que NO son recordatorios
 * —el resultado de verificar un pago (SUB-9), por ejemplo— viajen por los
 * mismos canales sin inventarse un `tier` que no les corresponde.
 */
export interface DeliverableMessage {
  title: string;
  /**
   * Texto plano y CORTO: qué pasa y qué hacer, sin datos de cobro.
   *
   * Es lo único que se muestra dentro de la app del teléfono, así que no puede
   * llevar montos, cuentas ni enlaces de pago: Apple y Google prohíben empujar
   * a pagar fuera de su sistema de compras, y una notificación con el número de
   * Pago Móvil es exactamente eso.
   */
  body: string;
  /**
   * Los datos para pagar —monto, Pago Móvil, banco, cédula, titular, enlace—,
   * una línea cada uno.
   *
   * Van aparte para que cada canal decida: el correo y la campana de la WEB los
   * muestran; el teléfono los ignora y se queda con el `body`. Vacío = no hay
   * nada configurado, o el aviso no es de cobro.
   */
  paymentLines: string[];
  /** El mismo mensaje en HTML, para el canal de correo. */
  html: string;
  /** A dónde lleva el toque. */
  actionUrl: string | null;
}

export interface ReminderMessage extends DeliverableMessage {
  tier: ReminderTier;
}

/** `dd/mm/aaaa`. Sin `toLocaleDateString` para no depender del ICU del server. */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function titleOf(context: ReminderContext): string {
  const { tier, daysLeft } = context;
  switch (tier) {
    case 'd-7':
    case 'd-3':
      return `Tu plan ${context.planName} vence en ${daysLeft} días`;
    case 'd-1':
      return `Tu plan ${context.planName} vence mañana`;
    case 'd0':
      return `Tu plan ${context.planName} vence hoy`;
    case 'grace':
      return 'Tu suscripción venció: te quedan días de cortesía';
    case 'blocked':
      return 'Tu acceso está bloqueado por falta de pago';
  }
}

function leadOf(context: ReminderContext): string {
  const vence = formatDate(context.periodEnd);
  switch (context.tier) {
    case 'grace':
      return (
        `Tu plan ${context.planName} venció el ${vence}. Puedes seguir ` +
        `trabajando hasta el ${formatDate(context.graceEndsAt)}; después se ` +
        'bloquea el acceso.'
      );
    case 'blocked':
      return (
        `Tu acceso quedó bloqueado porque el pago no llegó. Tus datos están ` +
        'intactos: en cuanto reportes el pago recuperas todo.'
      );
    default:
      return `Tu plan ${context.planName} vence el ${vence}.`;
  }
}

/** Las líneas de "cómo pagar". Se omiten las que no estén configuradas. */
function instructionLines(context: ReminderContext): string[] {
  const { instructions: pay, amountFormatted, currency } = context;
  const lines: string[] = [];

  if (amountFormatted) lines.push(`Monto: ${amountFormatted} ${currency}`);
  if (pay.phone) lines.push(`Pago Móvil: ${pay.phone}`);
  if (pay.bank) lines.push(`Banco: ${pay.bank}`);
  if (pay.identification) lines.push(`C.I./RIF: ${pay.identification}`);
  if (pay.holder) lines.push(`A nombre de: ${pay.holder}`);

  return lines;
}

/**
 * La tarjeta de color de cada tramo. Sube de tono como sube la insistencia: los
 * avisos lejanos son informativos, y el del bloqueo tiene que verse distinto de
 * un vistazo, sin leerlo entero.
 */
const NOTICE_POR_TIER: Record<
  ReminderTier,
  SubscriptionEmailNotice | undefined
> = {
  'd-7': undefined,
  'd-3': undefined,
  'd-1': { tone: 'warn', icon: '⏰', text: 'Tu plan vence mañana.' },
  d0: { tone: 'warn', icon: '⏰', text: 'Tu plan vence hoy.' },
  grace: {
    tone: 'warn',
    icon: '🕒',
    text: 'Sigues trabajando durante los días de cortesía. Después el acceso se pausa.',
  },
  blocked: {
    tone: 'warn',
    icon: '🔒',
    text: 'Tu acceso está pausado. Tus datos están intactos y vuelven en cuanto se verifique el pago.',
  },
};

export function buildReminderMessage(
  context: ReminderContext,
): ReminderMessage {
  const title = titleOf(context);

  // El cuerpo se queda con lo que se puede leer en cualquier parte. Los datos
  // de cobro salen de ahí y viajan aparte: dentro de la app del teléfono no se
  // muestran, y en la campana de la web igual se cortaban a dos líneas.
  const body = leadOf(context);
  const paymentLines = [...instructionLines(context)];

  if (context.instructions.link)
    paymentLines.push(`Reporta tu pago aquí: ${context.instructions.link}`);

  // El correo usa el mismo armazón que el resto del producto. Antes salía como
  // una tira de <p> sueltos: al lado de la confirmación de una cita parecía de
  // otra empresa, y en un correo de dinero eso se lee como fraude.
  const html = renderSubscriptionEmail({
    title,
    greeting: context.companyName,
    intro: [leadOf(context)],
    notice: NOTICE_POR_TIER[context.tier],
    payment: paymentLines.length
      ? { title: 'Datos para pagar', lines: instructionLines(context) }
      : undefined,
    cta: context.instructions.link
      ? { label: 'Reportar mi pago', url: context.instructions.link }
      : undefined,
  });

  return {
    tier: context.tier,
    title,
    body,
    paymentLines,
    html,
    actionUrl: context.instructions.link,
  };
}
