import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CalendarCompanyService } from './calendar-company.service';
import { CalendarCompany } from './entities/calendar-company.entity';
import { CreateCalendarCompanyDto } from './dto/create-calendar-company.dto';
import { UpdateCalendarCompanyDto } from './dto/update-calendar-company.dto';

@Controller('calendar-companies')
export class CalendarCompanyController {
  constructor(
    private readonly calendarCompanyService: CalendarCompanyService,
  ) {}

  @Get()
  async findAll(): Promise<CalendarCompany[]> {
    return this.calendarCompanyService.findAll();
  }

  @Get('company/:companyId')
  async findByCompanyId(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<CalendarCompany[]> {
    return this.calendarCompanyService.findByCompanyId(companyId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.findOne(id);
  }

  @Post()
  async create(
    @Body() createCalendarCompanyDto: CreateCalendarCompanyDto,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.create(createCalendarCompanyDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCalendarCompanyDto: UpdateCalendarCompanyDto,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.update(id, updateCalendarCompanyDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.calendarCompanyService.remove(id);
  }
}
