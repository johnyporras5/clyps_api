import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { StandingCommissionService } from './standing-commission.service';
import { CreateStandingCommissionDto } from './dto/create-standing-commission.dto';
import { UpdateStandingCommissionDto } from './dto/update-standing-commission.dto';

@Controller('standing-commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class StandingCommissionController {
  constructor(private readonly service: StandingCommissionService) {}

  // Todas las reglas de la compañía (para las pantallas de configuración).
  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.service.list(req.user.sub);
  }

  // Comisiones fijas resueltas para uno o varios servicios (?serviceIds=1,2,3).
  // Úsalo en Editar Servicio y para pre-cargar el cobro.
  @Get('resolve')
  resolve(
    @Request() req: AuthenticatedRequest,
    @Query('serviceIds') serviceIds: string,
  ) {
    const ids = (serviceIds || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return this.service.resolveForServicesByAdmin(req.user.sub, ids);
  }

  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateStandingCommissionDto,
  ) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStandingCommissionDto,
  ) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(req.user.sub, id);
  }
}
