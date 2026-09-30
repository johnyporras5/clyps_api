import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PublicBookingService } from './public-booking.service';

/**
 * Enlaces de reservas para compartir. Separado del controlador público porque
 * este SÍ requiere sesión: el trabajador consulta el suyo.
 */
@Controller('booking-links')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingLinksController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  /** GET /booking-links/me — un enlace por cada negocio donde trabaja. */
  @Get('me')
  @Roles('wrk')
  getMyLinks(@Request() req: AuthenticatedRequest) {
    return this.publicBookingService.getMyBookingLinks(req.user.sub);
  }
}
