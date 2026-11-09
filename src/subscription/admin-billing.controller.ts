import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import {
  AdminBillingService,
  type AdminBillingResponse,
} from './admin-billing.service';

/**
 * VIP y días extra de prueba desde el panel de la PLATAFORMA (`padm`).
 *
 * `@Roles('padm')` va en CADA método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio y dejaría
 * a cualquier dueño hacerse VIP a sí mismo.
 *
 * Una suplantación no llega aquí: su token lleva `userType: 'adm'`.
 */
@Controller('admin/companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  /** Lo hace VIP: deja de cobrársele y se anulan sus cobros abiertos. */
  @Roles('padm')
  @Post(':id/vip')
  @HttpCode(HttpStatus.OK)
  grantVip(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminBillingResponse> {
    return this.billing.grantVip(id, req.user.sub);
  }

  /** Le quita el VIP: vuelve a cobrársele, con 15 días de prueba desde hoy. */
  @Roles('padm')
  @Delete(':id/vip')
  revokeVip(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminBillingResponse> {
    return this.billing.revokeVip(id, req.user.sub);
  }

  /** +15 días de prueba desde hoy. Solo prueba vencida y sin ningún pago. */
  @Roles('padm')
  @Post(':id/trial-extension')
  @HttpCode(HttpStatus.OK)
  extendTrial(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminBillingResponse> {
    return this.billing.extendTrial(id, req.user.sub);
  }
}
