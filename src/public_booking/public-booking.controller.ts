import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PublicBookingService } from './public-booking.service';
import {
  CreatePublicBookingDto,
  PublicAvailabilityQueryDto,
} from './dto/create-public-booking.dto';

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

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
  @UseInterceptors(
    FileInterceptor('paymentProof', {
      limits: { fileSize: PROOF_MAX_BYTES, files: 1 },
    }),
  )
  async createBooking(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() paymentProof?: Express.Multer.File,
  ) {
    const dto = await parseBookingBody(body);
    if (
      paymentProof &&
      !/^image\/(jpeg|png|jpg|webp)$/.test(paymentProof.mimetype)
    ) {
      throw new BadRequestException(
        'El comprobante debe ser una imagen (JPG, PNG o WEBP).',
      );
    }
    return this.publicBookingService.createBooking(slug, dto, paymentProof);
  }
}

const bodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parseBookingBody(
  body: Record<string, unknown>,
): Promise<CreatePublicBookingDto> {
  let plain: unknown = body;
  if (typeof body?.data === 'string') {
    try {
      plain = JSON.parse(body.data);
    } catch {
      throw new BadRequestException('Los datos de la reserva no son válidos.');
    }
  }
  return bodyPipe.transform(plain, {
    type: 'body',
    metatype: CreatePublicBookingDto,
  }) as Promise<CreatePublicBookingDto>;
}
