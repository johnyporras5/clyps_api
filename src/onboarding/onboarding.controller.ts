import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import type {
  OnboardingSkipResponse,
  OnboardingStateResponse,
} from './dto/onboarding-state-response.dto';

/**
 * ONB-1. Todo va scoped a la company del token (el admin dueño).
 *
 * NO existe endpoint para "marcar paso completado": los pasos se actualizan
 * desde los módulos existentes vía hooks internos, nunca por el frontend.
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /** Checklist que pinta el frontend. */
  @Get('state')
  async getState(
    @Req() req: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    const companyId = await this.onboardingService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.onboardingService.getState(companyId);
  }

  /** El dueño elige "explorar por mi cuenta". No bloquea; puede retomar. */
  @Post('skip')
  @HttpCode(HttpStatus.OK)
  async skip(
    @Req() req: AuthenticatedRequest,
  ): Promise<OnboardingSkipResponse> {
    const companyId = await this.onboardingService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.onboardingService.skip(companyId);
  }

  /**
   * Interno/idempotente: recalcula los 5 pasos desde el estado real del sistema.
   * Sirve para reparar inconsistencias o al arrancar la feature sobre companies
   * existentes. No se expone en la UI del dueño.
   */
  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  async recompute(
    @Req() req: AuthenticatedRequest,
  ): Promise<OnboardingStateResponse> {
    const companyId = await this.onboardingService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    const state = await this.onboardingService.recomputeAll(companyId);
    return this.onboardingService.toResponse(state);
  }
}
