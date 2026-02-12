import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioPicturesService } from './portfolio_pictures.service';
import { PortfolioPicturesController } from './portfolio_pictures.controller';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([PortfolioPictures]),CommonModule],
  providers: [PortfolioPicturesService],
  controllers: [PortfolioPicturesController],
  exports: [PortfolioPicturesService],
})
export class PortfolioPicturesModule { }
