import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { SubscriptionController } from './subscription.controller';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
import { Company } from '../company/entities/company.entity';

/**
 * SUB-1 + SUB-2 + SUB-3 (CLYP-333 / CLYP-334 / CLYP-335).
 *
 * El catálogo de planes vive en código (`plans.config.ts`); de la BD se leen la
 * suscripción (qué plan cotizar) y los reportes de pago. `reminder_log` entra
 * con el job de recordatorios (SUB-8).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Subscription, PaymentReport, Company])],
  providers: [SubscriptionService, PaymentsService, ExchangeRateService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService, PaymentsService, ExchangeRateService],
})
export class SubscriptionModule {}
