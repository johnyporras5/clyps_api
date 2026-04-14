import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { Session } from './entities/session.entity';
import { Client } from 'src/client/entities/client.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { Service } from 'src/service/entities/service.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Worker } from 'src/worker/entities/worker.entity';
import { EmailModule } from 'src/email/email.module';
import { FileUploadService } from '../common/services/file_upload.service';
import { IAPromptsService } from '../IAprompts/ia_prompts.service'; 
import { IAPrompts } from '../IAprompts/entities/ia_prompts.entity'; 
import { ChatGPTService } from '../chatgpt/chatgpt.service'; 
import { ServiceOffer } from 'src/Offer/entities/service-offer.entity';
import { Offer } from 'src/Offer/entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Session, SessionDetail, Client, Company, User, Service, CompanyWorker, Worker,IAPrompts,Offer,
  ServiceOffer]), EmailModule],
  providers: [SessionService,IAPromptsService,ChatGPTService,FileUploadService],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule { }
