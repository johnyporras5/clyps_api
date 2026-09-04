import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import {
  SUBSCRIPTION_REMINDER_IN_APP,
  type SubscriptionReminderInAppEvent,
} from '../subscription/reminders/reminder-delivery';

/**
 * Entrega in-app de los recordatorios de cobro (SUB-8 / CLYP-339).
 *
 * Vive de este lado y no en el módulo de suscripciones porque
 * `NotificationModule` depende de `AuthModule`, que depende de
 * `SubscriptionModule`: importarlo de vuelta cerraría el ciclo. Escuchar un
 * evento deja la dependencia en una sola dirección.
 */
@Injectable()
export class SubscriptionReminderListener {
  private readonly logger = new Logger(SubscriptionReminderListener.name);

  constructor(private readonly notifications: NotificationService) {}

  @OnEvent(SUBSCRIPTION_REMINDER_IN_APP)
  async handle(event: SubscriptionReminderInAppEvent): Promise<void> {
    try {
      await this.notifications.createNotification(event.userId, {
        type: 'reminder',
        title: event.title,
        body: event.body,
        data: {
          type: 'reminder',
          companyId: event.companyId,
          ...(event.actionUrl ? { actionUrl: event.actionUrl } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo crear el recordatorio in-app del user ${event.userId}: ${
          (error as Error).message
        }`,
      );
    }
  }
}
