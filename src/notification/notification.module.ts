import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { Notification } from './entities/notification.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { FcmTokenController } from './fcm-token.controller';
import { NotificationRealtimeEmitter } from './notification-realtime.emitter';
import { FirebaseService } from './firebase.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, FcmToken]),
    // JwtAuthGuard depende del JwtModule/strategy que expone AuthModule.
    AuthModule,
    // RealtimeService para emitir `notification.created` a la room del usuario.
    RealtimeModule,
  ],
  providers: [NotificationService, NotificationRealtimeEmitter, FirebaseService],
  controllers: [NotificationController, FcmTokenController],
  // NotificationService se exportará para que createNotification (§4) lo use
  // desde los services de dominio.
  exports: [NotificationService, TypeOrmModule],
})
export class NotificationModule {}
