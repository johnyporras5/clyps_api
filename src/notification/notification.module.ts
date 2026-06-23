import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Notification } from './entities/notification.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { FcmTokenController } from './fcm-token.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, FcmToken]),
    // JwtAuthGuard depende del JwtModule/strategy que expone AuthModule.
    AuthModule,
  ],
  providers: [NotificationService],
  controllers: [NotificationController, FcmTokenController],
  // NotificationService se exportará para que createNotification (§4) lo use
  // desde los services de dominio.
  exports: [NotificationService, TypeOrmModule],
})
export class NotificationModule {}
