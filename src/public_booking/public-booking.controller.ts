import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicBookingService } from './public-booking.service';
import {
  CreatePublicBookingDto,
  PublicAvailabilityQueryDto,
} from './dto/create-public-booking.dto';

/**
 * Enlace público de reservas (/reservar/<slug> en la web). SIN autenticación
 * a propósito: es para clientes que no tienen la app ni cuenta.
 *
 * Solo lectura de datos públicos del negocio + crear la cita. La creación
 * lleva un límite por IP más estricto que el global (100/min).
 */
@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get(':slug')
  getProfile(@Param('slug') slug: string) {
    return this.publicBookingService.getProfile(slug);
  }

  /** Página de un profesional: /reservar/<negocio>/<profesional>. */
  @Get(':slug/workers/:workerSlug')
  getWorkerProfile(
    @Param('slug') slug: string,
    @Param('workerSlug') workerSlug: string,
  ) {
    return this.publicBookingService.getWorkerProfile(slug, workerSlug);
  }

  @Get(':slug/availability')
  getAvailability(
    @Param('slug') slug: string,
    @Query() query: PublicAvailabilityQueryDto,
  ) {
    return this.publicBookingService.getAvailability(slug, query);
  }

  @Post(':slug/sessions')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createBooking(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicBookingDto,
  ) {
    return this.publicBookingService.createBooking(slug, dto);
  }
}
