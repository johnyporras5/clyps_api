import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';
import type { ReminderChannel } from '../subscription.enums';
import type {
  ReminderChannelAdapter,
  ReminderRecipient,
} from './reminder-delivery';
import type { ReminderMessage } from './reminder-message.util';

/**
 * Recordatorio por correo (SUB-8).
 *
 * APAGADO por defecto: se enciende con `SUBSCRIPTION_REMINDER_CHANNELS`. Un job
 * diario que manda correos reales no debe activarse solo al desplegar —
 * cualquier prueba con datos de producción los mandaría de verdad.
 */
@Injectable()
export class EmailReminderChannel implements ReminderChannelAdapter {
  readonly channel: ReminderChannel = 'email';
  private readonly logger = new Logger(EmailReminderChannel.name);

  constructor(
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    const raw = this.config.get<string>('SUBSCRIPTION_REMINDER_CHANNELS') ?? '';
    return raw
      .split(',')
      .map((channel) => channel.trim())
      .includes('email');
  }

  async deliver(
    recipient: ReminderRecipient,
    message: ReminderMessage,
  ): Promise<boolean> {
    if (!recipient.email) return false;

    try {
      return await this.email.sendEmail(
        recipient.email,
        message.title,
        message.html,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar el recordatorio a ${recipient.email}: ${
          (error as Error).message
        }`,
      );
      return false;
    }
  }
}
