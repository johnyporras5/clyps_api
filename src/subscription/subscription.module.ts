import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { SubscriptionController } from './subscription.controller';
import { Subscription } from './entities/subscription.entity';
import { Company } from '../company/entities/company.entity';

/**
 * SUB-1 + SUB-2 (CLYP-333 / CLYP-334).
 *
 * El catálogo de planes vive en código (`plans.config.ts`); de la BD solo se lee
 * la suscripción para saber qué plan cotizar. `payment_report` y `reminder_log`
 * entran cuando SUB-3 traiga el reporte de pago.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Company])],
  providers: [SubscriptionService, PaymentsService, ExchangeRateService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService, PaymentsService, ExchangeRateService],
})
export class SubscriptionModule {}
