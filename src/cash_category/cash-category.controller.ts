import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CashCategoryService } from './cash-category.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateCashCategoryDto } from './dto/create-cash-category.dto';
import { UpdateCashCategoryDto } from './dto/update-cash-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { CashTransactionKind } from '../cash_transaction/cash-transaction.enums';

@Controller('cash-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class CashCategoryController {
  constructor(private readonly cashCategoryService: CashCategoryService) {}

  /**
   * Categorías de caja de la company. La primera llamada siembra las de por
   * defecto, así que "activar el módulo" es simplemente abrir la pantalla.
   *
   * `usableFor=expense|income` devuelve solo las que sirven para ese tipo de
   * movimiento (las 'both' entran siempre) — es lo que llena el selector del
   * formulario de gasto/ingreso.
   */
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('isActive') isActive?: string,
    @Query('usableFor') usableFor?: string,
  ) {
    // Sin el parámetro -> todas (activas e inactivas). Con él, filtra.
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const kind =
      usableFor === 'income' || usableFor === 'expense'
        ? (usableFor as CashTransactionKind)
        : undefined;

    return this.cashCategoryService.findAllByCompany(req.user.sub, {
      isActive: active,
      usableFor: kind,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashCategoryService.findOne(id, req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCashCategoryDto, @Req() req: AuthenticatedRequest) {
    return this.cashCategoryService.create(dto, req.user.sub);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashCategoryService.update(id, dto, req.user.sub);
  }

  /**
   * Borra la categoría. Si tiene movimientos, `?reassignTo=<id>` los mueve a
   * otra categoría antes de borrarla; sin ese parámetro responde 409 y no toca
   * nada.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @Query('reassignTo', new ParseIntPipe({ optional: true }))
    reassignTo?: number,
  ) {
    return this.cashCategoryService.remove(id, req.user.sub, reassignTo);
  }
}
