import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { Service } from './entities/service.entity';
import { Company } from 'src/company/entities/company.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Worker } from 'src/worker/entities/worker.entity';
import { ServiceCategory } from 'src/service_category/entities/service_category.entity';
import { ServiceOffer } from 'src/Offer/entities/service-offer.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service,Company,CompanyWorker,Worker,ServiceCategory,ServiceOffer,SessionDetail]),
    CommonModule,
  ],
  providers: [ServiceService],
  controllers: [ServiceController],
  exports: [ServiceService],
})
export class ServiceModule {}
