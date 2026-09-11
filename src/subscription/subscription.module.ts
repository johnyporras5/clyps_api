import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { BillingHistoryService } from './billing-history.service';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { SubscriptionController } from './subscription.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminSubscriptionController } from './admin-subscription.controller';
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
import { PaymentOutcomeService } from './notifications/payment-outcome.service';
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
 *
 * Es `@Global` desde SUB-12: el guard del bloqueo se cuelga de una docena de
 * controladores de otros módulos, y la alternativa era agregar
 * `imports: [SubscriptionModule]` en cada uno de ellos —doce archivos que no
 * cambian por ninguna otra razón y que se olvidan al sumar el trece—. La
 * condición que lo hace seguro es la de arriba: este módulo no depende de
 * ninguno de negocio, así que no puede formar un ciclo.
 */
@Global()
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
    // SUB-13: el historial de facturación del dueño. Solo lectura.
    BillingHistoryService,
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
    // SUB-9: le avisa al dueño si su pago se verificó o se rechazó, por los
    // mismos canales de SUB-8.
    PaymentOutcomeService,
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
    // Consulta de suscripcion por usuario, para el panel de plataforma.
    AdminSubscriptionController,
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
