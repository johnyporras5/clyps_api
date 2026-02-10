import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalendarCompany } from './entities/calendar-company.entity';
import { CreateCalendarCompanyDto } from './dto/create-calendar-company.dto';
import { UpdateCalendarCompanyDto } from './dto/update-calendar-company.dto';

@Injectable()
export class CalendarCompanyService {
  constructor(
    @InjectRepository(CalendarCompany)
    private calendarCompanyRepository: Repository<CalendarCompany>,
  ) {}

  async findAll(): Promise<CalendarCompany[]> {
    return await this.calendarCompanyRepository.find({
      relations: ['company'],
    });
  }

  async findOne(id: number): Promise<CalendarCompany> {
    const calendarCompany = await this.calendarCompanyRepository.findOne({
      where: { id },
      relations: ['company'],
    });
    
    if (!calendarCompany) {
      throw new NotFoundException(`CalendarCompany with id ${id} not found`);
    }
    return calendarCompany;
  }

  async findByCompanyId(companyId: number): Promise<CalendarCompany[]> {
    return await this.calendarCompanyRepository.find({
      where: { companyId },
      relations: ['company'],
    });
  }

  async create(createCalendarCompanyDto: CreateCalendarCompanyDto): Promise<CalendarCompany> {
    const calendarCompany = this.calendarCompanyRepository.create(createCalendarCompanyDto);
    return await this.calendarCompanyRepository.save(calendarCompany);
  }

  async update(id: number, updateCalendarCompanyDto: UpdateCalendarCompanyDto): Promise<CalendarCompany> {
    const calendarCompany = await this.calendarCompanyRepository.findOne({ where: { id } });
    
    if (!calendarCompany) {
      throw new NotFoundException(`CalendarCompany with id ${id} not found`);
    }
    
    Object.assign(calendarCompany, updateCalendarCompanyDto);
    return await this.calendarCompanyRepository.save(calendarCompany);
  }

  async remove(id: number): Promise<void> {
    const result = await this.calendarCompanyRepository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`CalendarCompany with id ${id} not found`);
    }
  }
}