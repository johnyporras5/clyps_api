import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { SubscriptionAccessGuard } from './guards/subscription-access.guard';
import { SubscriptionController } from './subscription.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { CommonModule } from '../common/common.module';

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
      Company,
      // Solo para contar trabajadores contra el tope del plan (SUB-5).
      CompanyWorker,
    ]),
    // Sube la foto del comprobante a Spaces (SUB-3).
    CommonModule,
  ],
  providers: [
    SubscriptionService,
    PaymentsService,
    EntitlementsService,
    ExchangeRateService,
    SubscriptionAccessGuard,
  ],
  controllers: [SubscriptionController, AdminPaymentsController],
  exports: [
    SubscriptionService,
    PaymentsService,
    EntitlementsService,
    ExchangeRateService,
    SubscriptionAccessGuard,
  ],
})
export class SubscriptionModule {}
