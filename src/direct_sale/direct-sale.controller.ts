import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { DirectSaleService } from './direct-sale.service';
import { CreateDirectSaleDto } from './dto/create-direct-sale.dto';

@Controller('direct-sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectSaleController {
  constructor(private readonly directSaleService: DirectSaleService) {}

  // Venta directa de productos a un cliente sin cita (con comisión/propina).
  @Post()
  @Roles('adm')
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateDirectSaleDto,
  ) {
    return this.directSaleService.create(req.user.sub, dto);
  }

  // Marca una venta directa en deuda como cobrada (el cliente ya pagó).
  @Post(':id/collect')
  @Roles('adm')
  async collect(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.directSaleService.markCollected(req.user.sub, id);
  }
}
