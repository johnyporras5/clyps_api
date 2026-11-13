import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CampaignEmailLog } from './entities/campaign-email-log.entity';
import { EmailOptOut } from './entities/email-opt-out.entity';
import { CampaignEmailService } from './campaign-email.service';
import { CampaignEmailTask } from './campaign-email.task';
import {
  AdminCampaignsController,
  PublicUnsubscribeController,
} from './campaign-email.controller';

/** Correos de campaña (promo Black Friday) y baja de promociones. */
@Module({
  imports: [
    TypeOrmModule.forFeature([CampaignEmailLog, EmailOptOut]),
    EmailModule,
    SubscriptionModule,
  ],
  controllers: [AdminCampaignsController, PublicUnsubscribeController],
  providers: [CampaignEmailService, CampaignEmailTask],
})
export class CampaignEmailModule {}
