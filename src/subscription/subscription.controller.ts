import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SubscriptionService } from './subscription.service';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import type { PlansResponse } from './dto/plans-response.dto';
import type { QuoteResponse } from './dto/quote-response.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { ReportPaymentDto } from './dto/report-payment.dto';
import type { PaymentReportResponse } from './dto/payment-report-response.dto';

/**
 * SUB-1 / SUB-2 (CLYP-333 / CLYP-334). Todo va detrás del token: quien elige
 * plan y paga es el dueño autenticado.
 *
 * `@Roles('adm')` va en CADA método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio.
 */
@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /** Planes disponibles con sus límites, más los días de prueba y gracia. */
  @Roles('adm')
  @Get('plans')
  getPlans(): PlansResponse {
    return this.subscriptionService.getPlans();
  }

  /**
   * SUB-2: monto exacto en Bs a pagar, con la tasa del momento. No persiste
   * nada — el cliente muestra el monto y lo conserva para reportarlo.
   */
  @Roles('adm')
  @Get('quote')
  async getQuote(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryQuoteDto,
  ): Promise<QuoteResponse> {
    const companyId = await this.paymentsService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.paymentsService.computeQuote(companyId, query.planId);
  }

  /**
   * SUB-3: el dueño reporta el pago que hizo. Queda como reclamo `reported` —
   * no activa nada hasta que se verifique (SUB-4).
   *
   * Va como `multipart/form-data`: los datos del pago como campos de texto y la
   * foto del comprobante en `proof`, para que el móvil lo mande todo de un
   * viaje. El comprobante es opcional pero acelera la verificación manual.
   */
  @Roles('adm')
  @Post('payments/report')
  @UseInterceptors(FileInterceptor('proof'))
  @HttpCode(HttpStatus.CREATED)
  async reportPayment(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportPaymentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: 'image/(jpeg|png|jpg|gif|webp)' }),
        ],
        fileIsRequired: false,
      }),
    )
    proof?: Express.Multer.File,
  ): Promise<PaymentReportResponse> {
    const companyId = await this.paymentsService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.paymentsService.reportPayment(companyId, dto, proof);
  }
}
