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
import { SessionDetailService } from './session_detail.service';
import { SessionDetail } from './entities/session_detail.entity';
import { CreateSessionDetailDto } from './dto/create-session_detail.dto';
import { UpdateSessionDetailDto } from './dto/update-session_detail.dto';

/**
 * CRUD genérico que ni la app ni el panel usan. Era público (sin login): se
 * podían leer, cambiar o borrar datos de cualquier salón. Queda solo para
 * `padm`, con `@Roles` en CADA método (el RolesGuard no lee el de la clase).
 */
@Controller('sessiondetails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionDetailController {
  constructor(private readonly SessionDetailService: SessionDetailService) {}

  @Get()
  @Roles('padm')
  async findAll(): Promise<SessionDetail[]> {
    return this.SessionDetailService.findAll();
  }

  @Get(':id')
  @Roles('padm')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<SessionDetail> {
    return this.SessionDetailService.findOne(id);
  }

  @Post()
  @Roles('padm')
  async create(
    @Body() createSessionDetailDto: CreateSessionDetailDto,
  ): Promise<SessionDetail> {
    return this.SessionDetailService.create(createSessionDetailDto);
  }

  @Put(':id')
  @Roles('padm')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSessionDetailDto: UpdateSessionDetailDto,
  ): Promise<SessionDetail> {
    return this.SessionDetailService.update(id, updateSessionDetailDto);
  }

  @Delete(':id')
  @Roles('padm')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.SessionDetailService.remove(id);
  }
}
