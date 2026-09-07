import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { getPlan } from '../config/plans.config';
import { billablePlanId } from '../entitlements.util';
import { EntitlementsService } from '../entitlements.service';
import {
  REMINDER_CHANNELS,
  type ReminderChannelAdapter,
  type ReminderRecipient,
} from '../reminders/reminder-delivery';
import type {
  DeliverableMessage,
  PaymentInstructions,
} from '../reminders/reminder-message.util';
import {
  SUBSCRIPTION_ACTIVATED,
  type SubscriptionActivatedEvent,
} from '../subscription.service';
import {
  buildPaymentRejectedMessage,
  buildPaymentVerifiedMessage,
} from './payment-outcome-message.util';
import {
  SUBSCRIPTION_PAYMENT_REJECTED,
  type SubscriptionPaymentRejectedEvent,
} from './payment-outcome.events';

/**
 * Le dice al dueño cómo terminó su pago (SUB-9 / CLYP-340).
 *
 * Escucha las dos transiciones que le importan —verificado y rechazado— y las
 * reparte por la MISMA capa de entrega de los recordatorios (SUB-8): este
 * servicio no sabe si el aviso sale por notificación, correo o WhatsApp.
 *
 * Escucha en vez de que lo llamen a propósito: verificar un pago no puede
 * fallar porque un correo no salga. Por eso además ningún error de entrega se
 * propaga; se registra y ya.
 *
 * La idempotencia viene de arriba: `advanceSubscription` solo emite cuando de
 * verdad extendió el período (verificar dos veces el mismo reporte no emite dos
 * veces), y rechazar exige que el reporte esté en revisión.
 */
@Injectable()
export class PaymentOutcomeService {
  private readonly logger = new Logger(PaymentOutcomeService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
    @Inject(REMINDER_CHANNELS)
    private readonly channels: ReminderChannelAdapter[],
  ) {}

  /** A dónde paga el dueño. La misma configuración que usa SUB-8. */
  private get instructions(): PaymentInstructions {
    const str = (key: string): string | null =>
      this.config.get<string>(key)?.trim() || null;
    return {
      phone: str('SUBSCRIPTION_PAY_PHONE'),
      bank: str('SUBSCRIPTION_PAY_BANK'),
      identification: str('SUBSCRIPTION_PAY_ID'),
      holder: str('SUBSCRIPTION_PAY_HOLDER'),
      link: str('SUBSCRIPTION_PAY_LINK'),
    };
  }

  @OnEvent(SUBSCRIPTION_ACTIVATED)
  async onActivated(event: SubscriptionActivatedEvent): Promise<void> {
    const recipient = await this.recipient(event.companyId);
    if (!recipient) return;

    const plan = getPlan(billablePlanId(event.planId));
    await this.deliver(
      recipient,
      buildPaymentVerifiedMessage({
        companyName: recipient.companyName,
        planName: plan.name,
        accessEndsAt: event.newPeriodEnd,
        link: this.instructions.link,
      }),
      `activación por el reporte ${event.paymentReportId}`,
    );
  }

  @OnEvent(SUBSCRIPTION_PAYMENT_REJECTED)
  async onRejected(event: SubscriptionPaymentRejectedEvent): Promise<void> {
    const recipient = await this.recipient(event.companyId);
    if (!recipient) return;

    // El acceso se consulta AHORA, con el reporte ya rechazado: mientras estaba
    // en revisión ese reclamo pendiente era lo que lo sostenía (SUB-5), y al
    // caerse puede haber quedado bloqueado en este mismo instante. Avisarle que
    // "nada cambió" sería enterarlo cuando intente cobrar una cita.
    const access = await this.entitlements.getAccessState(event.companyId);

    await this.deliver(
      recipient,
      buildPaymentRejectedMessage({
        companyName: recipient.companyName,
        reason: event.reason,
        reference: event.reference,
        access: {
          canOperate: access.canOperate,
          accessEndsAt: access.accessEndsAt,
          graceEndsAt: access.graceEndsAt,
        },
        instructions: this.instructions,
      }),
      `rechazo del reporte ${event.paymentReportId}`,
    );
  }

  /** Dueño y correo del salón. `null` si la company ya no existe. */
  private async recipient(
    companyId: number,
  ): Promise<ReminderRecipient | null> {
    const company = await this.companies.findOne({
      where: { id: companyId },
      select: { id: true, name: true, email: true, userId: true },
    });
    if (!company) {
      this.logger.warn(
        `No se pudo avisar: la company ${companyId} ya no existe.`,
      );
      return null;
    }
    return {
      companyId: company.id,
      companyName: company.name ?? `Salón ${company.id}`,
      userId: company.userId ?? null,
      email: company.email ?? null,
    };
  }

  /**
   * Reparte por todos los canales encendidos.
   *
   * Un canal que falla no corta a los demás, y que fallen todos tampoco rompe
   * nada: el pago ya está decidido y auditado en `subscription_event`. Queda el
   * log para poder reclamar.
   */
  private async deliver(
    recipient: ReminderRecipient,
    message: DeliverableMessage,
    what: string,
  ): Promise<void> {
    const sent: string[] = [];
    for (const channel of this.channels) {
      if (!channel.isEnabled()) continue;
      try {
        if (await channel.deliver(recipient, message))
          sent.push(channel.channel);
      } catch (error) {
        this.logger.error(
          `Canal ${channel.channel} falló avisando la ${what} de la company ` +
            `${recipient.companyId}: ${(error as Error).message}`,
        );
      }
    }

    if (!sent.length) {
      this.logger.warn(
        `Ningún canal entregó la ${what} a la company ${recipient.companyId}.`,
      );
      return;
    }
    this.logger.log(
      `Aviso de ${what} enviado a la company ${recipient.companyId} por ${sent.join(', ')}`,
    );
  }
}
