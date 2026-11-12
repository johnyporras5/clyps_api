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
import { CalendarService } from './calendar.service';
import { Calendar } from './entities/calendar.entity';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';

/**
 * CRUD genérico que ni la app ni el panel usan. Era público (sin login): se
 * podían leer, cambiar o borrar datos de cualquier salón. Queda solo para
 * `padm`, con `@Roles` en CADA método (el RolesGuard no lee el de la clase).
 */
@Controller('calendars')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly CalendarService: CalendarService) {}

  @Get()
  @Roles('padm')
  async findAll(): Promise<Calendar[]> {
    return this.CalendarService.findAll();
  }

  @Get(':id')
  @Roles('padm')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Calendar> {
    return this.CalendarService.findOne(id);
  }

  @Post()
  @Roles('padm')
  async create(
    @Body() createCalendarDto: CreateCalendarDto,
  ): Promise<Calendar> {
    return this.CalendarService.create(createCalendarDto);
  }

  @Put(':id')
  @Roles('padm')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCalendarDto: UpdateCalendarDto,
  ): Promise<Calendar> {
    return this.CalendarService.update(id, updateCalendarDto);
  }

  @Delete(':id')
  @Roles('padm')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.CalendarService.remove(id);
  }
}
