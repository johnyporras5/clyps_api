import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CashSupplierService } from './cash-supplier.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Autocompletado de proveedores de caja (CLYP-355). Vive bajo `/finances`
 * porque no es un recurso propio: no hay tabla de proveedores, solo una lectura
 * derivada del histórico de movimientos.
 */
@Controller('finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class CashSupplierController {
  constructor(private readonly cashSupplierService: CashSupplierService) {}

  /**
   * Proveedores ya usados por la company que coinciden con lo escrito.
   * Sin `q` devuelve los más frecuentes.
   */
  @Get('suppliers/suggest')
  suggest(
    @Req() req: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.cashSupplierService.suggest(req.user.sub, q, limit);
  }
}
