import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarCompanyService } from './calendar-company.service';
import { CalendarCompanyController } from './calendar-company.controller';
import { CalendarCompany } from './entities/calendar-company.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarCompany, Company])],
  providers: [CalendarCompanyService],
  controllers: [CalendarCompanyController],
  exports: [CalendarCompanyService],
})
export class CalendarCompanyModule {}
