import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Calendar } from './entities/calendar.entity';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Calendar)
    private CalendarRepository: Repository<Calendar>,
  ) {}

  async findAll(): Promise<Calendar[]> {
    return await this.CalendarRepository.find();
  }

  async findOne(id: number): Promise<Calendar> {
    const Calendar = await this.CalendarRepository.findOne({ where: { id } });
    if (!Calendar) {
      throw new NotFoundException(`Calendar with id ${id} not found`);
    }
    return Calendar;
  }

  async create(createCalendarDto: CreateCalendarDto): Promise<Calendar> {
    const Calendar = this.CalendarRepository.create(createCalendarDto);
    return await this.CalendarRepository.save(Calendar);
  }

  async update(id: number, updateCalendarDto: UpdateCalendarDto): Promise<Calendar> {
    const Calendar = await this.CalendarRepository.findOne({ where: { id } });
    if (!Calendar) {
      throw new NotFoundException(`Calendar with id ${id} not found`);
    }
    
    Object.assign(Calendar, updateCalendarDto);
    return await this.CalendarRepository.save(Calendar);
  }

  async remove(id: number): Promise<void> {
    const result = await this.CalendarRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Calendar with id ${id} not found`);
    }
  }
}
