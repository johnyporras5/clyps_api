import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientFavoriteCompanyService } from './client-favorite-company.service';
import { ClientFavoriteCompanyController } from './client-favorite-company.controller';
import { ClientFavoriteCompany } from './entities/client-favorite-company.entity';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientFavoriteCompany, Client, Company]),
    CommonModule,
  ],
  providers: [ClientFavoriteCompanyService],
  controllers: [ClientFavoriteCompanyController],
  exports: [ClientFavoriteCompanyService],
})
export class ClientFavoriteCompanyModule {}
