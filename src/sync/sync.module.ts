import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * BE-OFF-5: POST /sync/push. Reusa los servicios de citas y clientes; la
 * idempotencia (IdempotencyModule) y el bloqueo de suscripción
 * (SubscriptionModule) son globales.
 */
@Module({
  imports: [SessionModule, AuthModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
