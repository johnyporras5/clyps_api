import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { SubscriptionController } from './subscription.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { CobrixConfig } from './cobrix/cobrix.config';
import { CobrixClient } from './cobrix/cobrix.client';
import { CobrixInvoiceService } from './cobrix/cobrix-invoice.service';
import { CobrixWebhookService } from './cobrix/cobrix-webhook.service';
import { CobrixWebhookController } from './cobrix/cobrix-webhook.controller';
import { CobrixReconciliationService } from './cobrix/cobrix-reconciliation.service';
import { CobrixReconciliationTask } from './cobrix/cobrix-reconciliation.task';
import { RemindersService } from './reminders/reminders.service';
import { RemindersTask } from './reminders/reminders.task';
import { InAppReminderChannel } from './reminders/in-app-reminder.channel';
import { EmailReminderChannel } from './reminders/email-reminder.channel';
import { REMINDER_CHANNELS } from './reminders/reminder-delivery';
import { AdminRemindersController } from './reminders/admin-reminders.controller';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { PaymentGatewayEvent } from './entities/payment-gateway-event.entity';
import { SubscriptionInvoice } from './entities/subscription-invoice.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { ReminderLog } from './entities/reminder-log.entity';
import { CommonModule } from '../common/common.module';
import { EmailModule } from '../email/email.module';

/**
 * Suscripciones: SUB-1 a SUB-6 (CLYP-333 … CLYP-338).
 *
 * `EntitlementsService` y su guard se EXPORTAN a propósito: son la única puerta
 * de acceso del sistema, y el resto de los módulos (nómina, análisis, IA,
 * trabajadores) deben preguntarle a ella en vez de leer el plan por su cuenta.
 *
 * Este módulo no importa ningún módulo de negocio —solo entidades— para que
 * cualquiera pueda importarlo sin ciclos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionEvent,
      PaymentReport,
      // Los webhooks ya procesados de Cobrix: la idempotencia de SUB-10.
      PaymentGatewayEvent,
      // El documento de cobro contra el que Cobrix concilia (SUB-10).
      SubscriptionInvoice,
      Company,
      // Solo para contar trabajadores contra el tope del plan (SUB-5).
      CompanyWorker,
      // Bitácora de recordatorios de cobro: su idempotencia (SUB-8).
      ReminderLog,
    ]),
    // Sube la foto del comprobante a Spaces (SUB-3).
    CommonModule,
    // Canal de correo de los recordatorios (SUB-8). No depende de nadie más,
    // así que no hay ciclo posible.
    EmailModule,
  ],
  providers: [
    SubscriptionService,
    PaymentsService,
    EntitlementsService,
    ExchangeRateService,
    SubscriptionAccessGuard,
    // SUB-10. El job de conciliación vive aquí y no en `src/tasks` para que el
    // módulo siga siendo autocontenido: `@Cron` funciona en cualquier provider
    // porque `ScheduleModule.forRoot()` ya está en el módulo raíz.
    CobrixConfig,
    CobrixClient,
    CobrixInvoiceService,
    CobrixWebhookService,
    CobrixReconciliationService,
    CobrixReconciliationTask,
    // SUB-8: recordatorios de cobro. Los canales se registran en una lista, así
    // que sumar WhatsApp mañana es agregar una clase aquí y nada más.
    RemindersService,
    RemindersTask,
    InAppReminderChannel,
    EmailReminderChannel,
    {
      provide: REMINDER_CHANNELS,
      useFactory: (
        inApp: InAppReminderChannel,
        email: EmailReminderChannel,
      ) => [inApp, email],
      inject: [InAppReminderChannel, EmailReminderChannel],
    },
  ],
  controllers: [
    SubscriptionController,
    AdminPaymentsController,
    CobrixWebhookController,
    AdminRemindersController,
  ],
  exports: [
    SubscriptionService,
    PaymentsService,
    EntitlementsService,
    ExchangeRateService,
    SubscriptionAccessGuard,
    CobrixInvoiceService,
    RemindersService,
  ],
})
export class SubscriptionModule {}
