import type { ReminderTier } from '../subscription.enums';

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

export interface ReminderMessage {
  tier: ReminderTier;
  title: string;
  /** Texto plano: sirve igual para in-app, WhatsApp o el cuerpo del correo. */
  body: string;
  /** El mismo mensaje en HTML, para el canal de correo. */
  html: string;
  /** A dónde lleva el toque. */
  actionUrl: string | null;
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

export function buildReminderMessage(
  context: ReminderContext,
): ReminderMessage {
  const title = titleOf(context);
  const lines = [leadOf(context), '', ...instructionLines(context)];

  if (context.instructions.link)
    lines.push('', `Reporta tu pago aquí: ${context.instructions.link}`);

  const body = lines.filter((line, i, all) => line || all[i - 1]).join('\n');

  const html = [
    `<h2>${title}</h2>`,
    `<p>Hola ${context.companyName},</p>`,
    `<p>${leadOf(context)}</p>`,
    instructionLines(context).length
      ? `<ul>${instructionLines(context)
          .map((line) => `<li>${line}</li>`)
          .join('')}</ul>`
      : '',
    context.instructions.link
      ? `<p><a href="${context.instructions.link}">Reportar mi pago</a></p>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    tier: context.tier,
    title,
    body,
    html,
    actionUrl: context.instructions.link,
  };
}
