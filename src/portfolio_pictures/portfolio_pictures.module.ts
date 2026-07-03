import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioPicturesService } from './portfolio_pictures.service';
import { PortfolioPicturesController } from './portfolio_pictures.controller';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { CompanyPortfolioPictures } from './entities/company_portfolio_pictures.entity';
import { Worker } from '../worker/entities/worker.entity';
import { Company } from '../company/entities/company.entity';
import { CommonModule } from 'src/common/common.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PortfolioPictures,
      CompanyPortfolioPictures,
      Worker,
      Company,
    ]),
    CommonModule,
    RealtimeModule,
  ],
  providers: [PortfolioPicturesService],
  controllers: [PortfolioPicturesController],
  exports: [PortfolioPicturesService],
})
export class PortfolioPicturesModule {}
