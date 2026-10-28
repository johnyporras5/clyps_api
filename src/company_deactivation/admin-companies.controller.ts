import {
  Body,
  Controller,
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
  CompanyDeactivationService,
  type CompanyDeactivationResponse,
} from './company-deactivation.service';
import { DeactivateCompanyDto } from './dto/deactivate-company.dto';

/**
 * Desactivar / reactivar salones desde el panel de la PLATAFORMA (`padm`).
 *
 * `@Roles('padm')` va en CADA método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio y dejaría
 * a cualquier dueño desactivar el salón de la competencia.
 *
 * Una suplantación no llega aquí: su token lleva `userType: 'adm'`.
 */
@Controller('admin/companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCompaniesController {
  constructor(private readonly deactivation: CompanyDeactivationService) {}

  /**
   * Corta el acceso del salón y cancela en silencio sus citas pendientes. Quién
   * lo hizo sale del token, no del body.
   */
  @Roles('padm')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeactivateCompanyDto,
  ): Promise<CompanyDeactivationResponse> {
    return this.deactivation.deactivate(id, req.user.sub, dto.reason);
  }

  /** Vuelve a abrir el salón. Las citas canceladas siguen canceladas. */
  @Roles('padm')
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CompanyDeactivationResponse> {
    return this.deactivation.reactivate(id);
  }
}
