import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CashTransactionService } from './cash-transaction.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';
import { UpdateCashTransactionDto } from './dto/update-cash-transaction.dto';
import { QueryCashTransactionsDto } from './dto/query-cash-transactions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * CRUD de movimientos de caja (CLYP-354). Cuelga de `/finances` junto al
 * autocompletado de proveedores.
 */
@Controller('finances/transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class CashTransactionController {
  constructor(
    private readonly cashTransactionService: CashTransactionService,
  ) {}

  /** Listado paginado, de la fecha más reciente a la más vieja. */
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryCashTransactionsDto,
  ) {
    return this.cashTransactionService.findAll(req.user.sub, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashTransactionService.findOne(id, req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCashTransactionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashTransactionService.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashTransactionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashTransactionService.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashTransactionService.remove(id, req.user.sub);
  }
}
