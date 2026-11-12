import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CalendarCompanyService } from './calendar-company.service';
import { CalendarCompany } from './entities/calendar-company.entity';
import { CreateCalendarCompanyDto } from './dto/create-calendar-company.dto';
import { UpdateCalendarCompanyDto } from './dto/update-calendar-company.dto';

/**
 * CRUD genérico que ni la app ni el panel usan. Era público (sin login): se
 * podían leer, cambiar o borrar datos de cualquier salón. Queda solo para
 * `padm`, con `@Roles` en CADA método (el RolesGuard no lee el de la clase).
 */
@Controller('calendar-companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarCompanyController {
  constructor(
    private readonly calendarCompanyService: CalendarCompanyService,
  ) {}

  @Get()
  @Roles('padm')
  async findAll(): Promise<CalendarCompany[]> {
    return this.calendarCompanyService.findAll();
  }

  @Get('company/:companyId')
  @Roles('padm')
  async findByCompanyId(
    @Param('companyId', ParseIntPipe) companyId: number,
  ): Promise<CalendarCompany[]> {
    return this.calendarCompanyService.findByCompanyId(companyId);
  }

  @Get(':id')
  @Roles('padm')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.findOne(id);
  }

  @Post()
  @Roles('padm')
  async create(
    @Body() createCalendarCompanyDto: CreateCalendarCompanyDto,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.create(createCalendarCompanyDto);
  }

  @Put(':id')
  @Roles('padm')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCalendarCompanyDto: UpdateCalendarCompanyDto,
  ): Promise<CalendarCompany> {
    return this.calendarCompanyService.update(id, updateCalendarCompanyDto);
  }

  @Delete(':id')
  @Roles('padm')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.calendarCompanyService.remove(id);
  }
}
