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

@Module({
  imports: [TypeOrmModule.forFeature([Session, SessionDetail, Client, Company, User, Service, CompanyWorker, Worker]), EmailModule],
  providers: [SessionService],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule { }
