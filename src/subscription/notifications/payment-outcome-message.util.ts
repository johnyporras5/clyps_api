import {
  formatDate,
  type DeliverableMessage,
  type PaymentInstructions,
} from '../reminders/reminder-message.util';

/**
 * El texto del aviso de resultado de un pago (SUB-9 / CLYP-340).
 *
 * Pura y sin canal, igual que la de los recordatorios: produce MENSAJE y la
 * capa de entrega decide si viaja como notificación in-app, correo o WhatsApp.
 *
 * Dos mensajes con trabajos distintos:
 *
 * - VERIFICADO cierra el asunto. Lo único que el dueño necesita saber es hasta
 *   cuándo tiene el plan; no se le pide nada más.
 * - RECHAZADO tiene que ser accionable. Un "no pudimos confirmarlo" sin motivo
 *   ni salida deja al dueño sin saber si perdió su dinero: por eso lleva el
 *   motivo tal como lo escribió quien revisó, la referencia de SU pago para que
 *   sepa cuál es, y el enlace para reportarlo de nuevo.
 */

export interface PaymentVerifiedContext {
  companyName: string;
  planName: string;
  /** Hasta cuándo llega el acceso pagado. */
  accessEndsAt: Date;
  /** Enlace a la pantalla de suscripción; `null` si no está configurado. */
  link: string | null;
}

export interface PaymentRejectedContext {
  companyName: string;
  /** El motivo que escribió quien revisó. Es obligatorio al rechazar. */
  reason: string;
  /** Referencia del pago, para que el dueño identifique cuál fue. */
  reference: string | null;
  instructions: PaymentInstructions;
}

/** Escapa lo que va dentro del HTML: el motivo lo escribe una persona. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

/** "Plan activado hasta {fecha}": el pago se verificó y el acceso ya corre. */
export function buildPaymentVerifiedMessage(
  context: PaymentVerifiedContext,
): DeliverableMessage {
  const until = formatDate(context.accessEndsAt);
  const lines = [
    `Hola, ${context.companyName}.`,
    `Confirmamos tu pago: tu plan ${context.planName} queda activo hasta el ${until}.`,
    'No tienes que hacer nada más.',
  ];

  return {
    title: `Plan ${context.planName} activado hasta el ${until}`,
    body: lines.join('\n\n'),
    html: paragraphs(lines),
    actionUrl: context.link,
  };
}

/** "No pudimos confirmarlo": el motivo y cómo volver a intentarlo. */
export function buildPaymentRejectedMessage(
  context: PaymentRejectedContext,
): DeliverableMessage {
  const { instructions } = context;

  const lines = [
    `Hola, ${context.companyName}.`,
    context.reference
      ? `No pudimos confirmar el pago con referencia ${context.reference}.`
      : 'No pudimos confirmar tu pago.',
    `Motivo: ${context.reason}`,
    'Revisa el comprobante y repórtalo de nuevo con los datos corregidos: el monto y la referencia deben coincidir con lo que muestra tu banco.',
  ];

  // Los datos de pago se repiten aquí a propósito: quien tiene que corregir un
  // pago rechazado no debería salir a buscarlos a otra pantalla.
  if (instructions.phone && instructions.bank) {
    lines.push(
      `Pago Móvil: ${instructions.phone} · ${instructions.bank}` +
        (instructions.identification
          ? ` · ${instructions.identification}`
          : '') +
        (instructions.holder ? ` · ${instructions.holder}` : ''),
    );
  }

  lines.push('Tu acceso no cambió: sigues con el plan que tenías.');

  return {
    title: 'No pudimos confirmar tu pago',
    body: lines.join('\n\n'),
    html: paragraphs(lines),
    actionUrl: instructions.link,
  };
}
