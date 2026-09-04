import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ReminderChannel } from '../subscription.enums';
import {
  SUBSCRIPTION_REMINDER_IN_APP,
  type ReminderChannelAdapter,
  type ReminderRecipient,
  type SubscriptionReminderInAppEvent,
} from './reminder-delivery';
import type { ReminderMessage } from './reminder-message.util';

/**
 * Recordatorio dentro de la app (SUB-8). Es el canal por defecto: no cuesta,
 * no depende de terceros y llega al mismo sitio donde se paga.
 *
 * Emite un evento en vez de llamar a `NotificationService` — ver el porqué en
 * `reminder-delivery.ts`.
 */
@Injectable()
export class InAppReminderChannel implements ReminderChannelAdapter {
  readonly channel: ReminderChannel = 'in_app';

  constructor(private readonly events: EventEmitter2) {}

  isEnabled(): boolean {
    return true;
  }

  deliver(
    recipient: ReminderRecipient,
    message: ReminderMessage,
  ): Promise<boolean> {
    // Sin dueño no hay a quién notificar dentro de la app.
    if (!recipient.userId) return Promise.resolve(false);

    this.events.emit(SUBSCRIPTION_REMINDER_IN_APP, {
      userId: recipient.userId,
      companyId: recipient.companyId,
      title: message.title,
      body: message.body,
      actionUrl: message.actionUrl,
    } satisfies SubscriptionReminderInAppEvent);

    return Promise.resolve(true);
  }
}
