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

/**
 * Cómo quedó el acceso DESPUÉS del rechazo.
 *
 * Se calcula al momento de avisar, no antes: mientras el reporte estaba en
 * revisión, ese reclamo pendiente era lo que sostenía el acceso —la invariante
 * de SUB-5: un pago reportado siempre concede acceso, aunque la gracia ya se
 * haya agotado—. Al rechazarlo ese sostén desaparece, y si la gracia venció el
 * salón queda bloqueado en ese mismo instante.
 */
export interface RejectedAccessState {
  /** false = quedó bloqueado: solo puede entrar a pagar. */
  canOperate: boolean;
  /** Hasta cuándo le llega el acceso, si todavía le llega. */
  accessEndsAt: Date | null;
  /** Fin de la cortesía, cuando está dentro de ella. */
  graceEndsAt: Date | null;
}

export interface PaymentRejectedContext {
  companyName: string;
  /** El motivo que escribió quien revisó. Es obligatorio al rechazar. */
  reason: string;
  /** Referencia del pago, para que el dueño identifique cuál fue. */
  reference: string | null;
  /** Cómo le quedó el acceso al rechazar. */
  access: RejectedAccessState;
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

/**
 * Qué le pasó al acceso con el rechazo. Es la parte que NO se puede maquillar.
 *
 * Decirle "tu acceso no cambió" a alguien que acaba de quedar bloqueado es
 * mentirle en el peor momento: se entera cuando intenta cobrar una cita.
 */
function accessLineOf(access: RejectedAccessState): string {
  if (!access.canOperate) {
    return (
      'Tu acceso quedó BLOQUEADO: mientras revisábamos este pago seguías ' +
      'operando, y al no poder confirmarlo se acabó esa cortesía. Reporta un ' +
      'pago válido para reactivarlo de inmediato.'
    );
  }
  if (access.graceEndsAt) {
    return (
      `Tu plan está vencido y te quedan días de cortesía hasta el ` +
      `${formatDate(access.graceEndsAt)}. Después de esa fecha el acceso se bloquea.`
    );
  }
  if (access.accessEndsAt) {
    return `Tu acceso sigue vigente hasta el ${formatDate(access.accessEndsAt)}.`;
  }
  return 'Tu acceso sigue vigente.';
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

  lines.push(accessLineOf(context.access));

  return {
    title: context.access.canOperate
      ? 'No pudimos confirmar tu pago'
      : 'No pudimos confirmar tu pago: tu acceso quedó bloqueado',
    body: lines.join('\n\n'),
    html: paragraphs(lines),
    actionUrl: instructions.link,
  };
}
