import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioPicturesService } from './portfolio_pictures.service';
import { PortfolioPicturesController } from './portfolio_pictures.controller';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PortfolioPictures])],
  providers: [PortfolioPicturesService],
  controllers: [PortfolioPicturesController],
  exports: [PortfolioPicturesService],
})
export class PortfolioPicturesModule {}
