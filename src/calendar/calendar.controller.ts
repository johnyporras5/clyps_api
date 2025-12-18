import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { Calendar } from './entities/calendar.entity';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

@Controller('calendars')
export class CalendarController {
  constructor(private readonly CalendarService: CalendarService) {}

  @Get()
  async findAll(): Promise<Calendar[]> {
    return this.CalendarService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Calendar> {
    return this.CalendarService.findOne(id);
  }

  @Post()
  async create(@Body() createCalendarDto: CreateCalendarDto): Promise<Calendar> {
    return this.CalendarService.create(createCalendarDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCalendarDto: UpdateCalendarDto,
  ): Promise<Calendar> {
    return this.CalendarService.update(id, updateCalendarDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.CalendarService.remove(id);
  }
}
