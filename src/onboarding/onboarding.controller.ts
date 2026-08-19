import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import {
  OnboardingTemplateService,
  DEFAULT_SERVICES_PER_RUBRO,
} from './onboarding-template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import type {
  OnboardingSkipResponse,
  OnboardingStateResponse,
} from './dto/onboarding-state-response.dto';
import type { OnboardingTemplatesResponse } from './dto/onboarding-templates-response.dto';
import { OnboardingServicesService } from './onboarding-services.service';
import { ConfirmServicesDto } from './dto/confirm-services.dto';
import type { ConfirmServicesResponse } from './dto/confirm-services-response.dto';

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
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly templateService: OnboardingTemplateService,
    private readonly servicesService: OnboardingServicesService,
  ) {}

  /**
   * ONB-3: convierte las plantillas que el dueño dejó marcadas en SUS categorías
   * y servicios reales. Atómico e idempotente: reenviarlo no duplica, actualiza.
   */
  @Post('services/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmServices(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmServicesDto,
  ): Promise<ConfirmServicesResponse> {
    const companyId = await this.onboardingService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.servicesService.confirmServices(companyId, dto);
  }

  /**
   * ONB-2: catálogo maestro de plantillas, combinado por rubro y sin duplicados.
   *
   * `?rubros=barberia,salon_belleza` para pedirlos explícitos; sin el parámetro
   * se usan los rubros que la company ya marcó al registrarse. `?limit=` baja el
   * tope de servicios por rubro. Solo lee: no crea nada (eso es ONB-3).
   */
  @Get('templates')
  async getTemplates(
    @Req() req: AuthenticatedRequest,
    @Query('rubros') rubros?: string,
    @Query('limit') limit?: string,
  ): Promise<OnboardingTemplatesResponse> {
    const companyId = await this.onboardingService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    const requested = rubros
      ? rubros
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      : undefined;
    const parsedLimit = Number(limit);
    const effectiveLimit =
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : DEFAULT_SERVICES_PER_RUBRO;

    return this.templateService.getTemplates(
      companyId,
      requested,
      effectiveLimit,
    );
  }

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
