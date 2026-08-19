import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';
import { OnboardingRescueService } from './onboarding-rescue.service';
import type { SweepResult } from './onboarding-rescue.service';

/**
 * ONB-4. Endpoints INTERNOS de plataforma, no del dueño: cruzan todos los
 * tenants. Van detrás de `InternalKeyGuard` (header `x-internal-key`), no del
 * rol `adm`.
 */
@Controller('onboarding')
@UseGuards(InternalKeyGuard)
export class OnboardingRescueController {
  constructor(private readonly rescue: OnboardingRescueService) {}

  /**
   * La cola de rescate en vivo, agrupada por urgencia. Es la base del panel
   * interno que a futuro reemplaza al correo-digest.
   */
  @Get('rescue-queue')
  getQueue() {
    return this.rescue.getRescueQueue();
  }

  /**
   * Dispara el barrido a mano, sin esperar a las 8:00 am. Respeta el anti-spam,
   * así que llamarlo dos veces seguidas no vuelve a notificar a nadie.
   */
  @Post('rescue-sweep')
  @HttpCode(HttpStatus.OK)
  runSweep(): Promise<SweepResult> {
    return this.rescue.runSweep();
  }
}
