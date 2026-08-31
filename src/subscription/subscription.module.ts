import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

/**
 * SUB-1 (CLYP-333). Todavía no registra repositorios: el catálogo de planes
 * vive en código. Las entidades (`subscription`, `payment_report`,
 * `reminder_log`) ya existen y TypeORM las descubre por glob; el
 * `TypeOrmModule.forFeature` entra cuando SUB-2 traiga los servicios que las
 * leen y escriben.
 */
@Module({
  providers: [SubscriptionService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
