import type { ReminderChannel } from '../subscription.enums';
import type { DeliverableMessage } from './reminder-message.util';

/**
 * La capa de entrega de los avisos de suscripción (SUB-8 / CLYP-339).
 *
 * Quien avisa decide A QUIÉN y QUÉ decirle; los adaptadores deciden POR DÓNDE.
 * Agregar WhatsApp mañana es una clase nueva que implementa esta interfaz y se
 * registra en el módulo: la lógica de cuándo avisar no se toca.
 *
 * La usan los recordatorios de cobro (SUB-8) y el resultado de verificar un
 * pago (SUB-9). Por eso el mensaje que recibe es un `DeliverableMessage` pelado
 * y no un recordatorio: el canal no tiene por qué saber de dónde viene.
 */

export interface ReminderRecipient {
  companyId: number;
  companyName: string;
  /** Dueño del salón. `null` si la company quedó sin usuario asociado. */
  userId: number | null;
  email: string | null;
}

export interface ReminderChannelAdapter {
  readonly channel: ReminderChannel;
  /** Un canal apagado por configuración ni siquiera se intenta. */
  isEnabled(): boolean;
  /** `true` si se entregó. Un `false` no corta el resto de los canales. */
  deliver(
    recipient: ReminderRecipient,
    message: DeliverableMessage,
  ): Promise<boolean>;
}

/** Token de inyección de la lista de adaptadores registrados. */
export const REMINDER_CHANNELS = Symbol('REMINDER_CHANNELS');

/**
 * Evento con el que el canal in-app le pide a `NotificationModule` que cree la
 * notificación.
 *
 * Se hace por evento y no inyectando `NotificationService` porque ese módulo
 * depende de `AuthModule`, que a su vez depende de este: importarlo de vuelta
 * cerraría el ciclo. El evento deja la dependencia en una sola dirección.
 */
export const SUBSCRIPTION_REMINDER_IN_APP = 'subscription.reminder.in_app';

/** Lo que viaja en ese evento. */
export interface SubscriptionReminderInAppEvent {
  userId: number;
  companyId: number;
  title: string;
  body: string;
  /**
   * Los datos de cobro, aparte del cuerpo. Quien pinta la notificación decide
   * si los muestra: la web sí, el teléfono no (regla de las tiendas).
   */
  paymentLines: string[];
  actionUrl: string | null;
}
