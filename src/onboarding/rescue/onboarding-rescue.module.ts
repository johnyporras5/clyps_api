import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OnboardingRescueService } from './onboarding-rescue.service';
import { OnboardingRescueController } from './onboarding-rescue.controller';
import { OnboardingRescueNotification } from '../entities/onboarding_rescue_notification.entity';
import { EmailModule } from '../../email/email.module';
import { NotificationModule } from '../../notification/notification.module';

/**
 * ONB-4 vive en su propio módulo a propósito.
 *
 * Necesita NotificationModule, que importa AuthModule, que a su vez importa
 * OnboardingModule por el hook de `add_team` (ONB-1). Meter el rescate dentro de
 * OnboardingModule cerraría ese ciclo; aquí no, porque nadie importa este módulo
 * más que AppModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OnboardingRescueNotification]),
    ConfigModule,
    EmailModule,
    NotificationModule,
  ],
  providers: [OnboardingRescueService],
  controllers: [OnboardingRescueController],
  exports: [OnboardingRescueService],
})
export class OnboardingRescueModule {}
