import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import type { PaginationResult } from '../common/dto/pagination.dto';
import type {
  AdminPaymentDecisionResponse,
  AdminPaymentItem,
} from './dto/admin-payment-response.dto';

/**
 * Cola de verificación de pagos (SUB-4 / CLYP-336).
 *
 * Endpoints del administrador de la PLATAFORMA (`padm`), la persona que opera
 * la app. NO del dueño del salón (`adm`): la cola cruza todos los tenants y
 * nadie debe ver ni aprobar los pagos de otro.
 *
 * `@Roles('padm')` va en CADA método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio y dejaría
 * pasar a cualquier usuario autenticado.
 */
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * La cola. Por defecto `status=reported` y del más antiguo al más nuevo: es
   * el orden en que hay que atenderla.
   */
  @Roles('padm')
  @Get()
  list(
    @Query() query: QueryAdminPaymentsDto,
  ): Promise<PaginationResult<AdminPaymentItem>> {
    return this.payments.listForAdmin(query);
  }

  /**
   * Confirma el pago y avanza la suscripción del tenant. Quién verificó sale
   * del token, no del body: una verificación no se firma con el id de otro.
   */
  @Roles('padm')
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminPaymentDecisionResponse> {
    return this.payments.verifyPayment(id, req.user.sub);
  }

  /** Rechaza el pago con un motivo. No toca la suscripción. */
  @Roles('padm')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectPaymentDto,
  ): Promise<AdminPaymentDecisionResponse> {
    return this.payments.rejectPayment(id, dto, req.user.sub);
  }
}
