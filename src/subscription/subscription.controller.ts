import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SubscriptionService } from './subscription.service';
import { BillingHistoryService } from './billing-history.service';
import { PaymentsService } from './payments.service';
import { EntitlementsService } from './entitlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import type { PlansResponse } from './dto/plans-response.dto';
import type { QuoteResponse } from './dto/quote-response.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { ReportPaymentDto } from './dto/report-payment.dto';
import { StartCheckoutDto } from './dto/start-checkout.dto';
import { ChoosePlanDto } from './dto/choose-plan.dto';
import { CobrixInvoiceService } from './cobrix/cobrix-invoice.service';
import type { PaymentReportResponse } from './dto/payment-report-response.dto';
import type { AccessResponse } from './dto/access-response.dto';
import type { PaymentInstructionsResponse } from './dto/payment-instructions-response.dto';
import type { CheckoutResponse } from './dto/checkout-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import type {
  BillingHistoryDetail,
  BillingHistoryResponse,
} from './dto/billing-history-response.dto';

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
    private readonly entitlements: EntitlementsService,
    private readonly checkout: CobrixInvoiceService,
    private readonly billingHistory: BillingHistoryService,
  ) {}

  /** Planes disponibles con sus límites, más los días de prueba y gracia. */
  @Roles('adm')
  @Get('plans')
  getPlans(): PlansResponse {
    return this.subscriptionService.getPlans();
  }

  /**
   * SUB-5: qué puede hacer este salón ahora mismo. Es la fuente para pintar el
   * panel: qué funciones tiene, cuáles necesitan upgrade y cuánto le queda.
   *
   * Siempre permitido, también con el tenant bloqueado: es justo la pantalla
   * que le dice que está bloqueado.
   */
  @Roles('adm')
  @Get('access')
  async getAccess(@Req() req: AuthenticatedRequest): Promise<AccessResponse> {
    const companyId = await this.entitlements.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.entitlements.getAccessResponse(companyId);
  }

  /**
   * SUB-5: lo que la app del cliente final necesita saber del salón antes de
   * renderizar — hoy, si mostrar la sugerencia con IA.
   *
   * Sin `@Roles`: lo consulta el cliente (`cli`), no el dueño. Devuelve solo
   * banderas de presentación, ningún dato de cobro.
   */
  @Get('features/company/:companyId')
  getCompanyFeatures(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.entitlements.getPublicFeatures(companyId);
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
   * SUB-FE-1: a dónde paga. Lo consume la pantalla de reportar pago, que sin
   * esto tendría que llevar nuestros datos bancarios escritos a mano.
   *
   * No depende del tenant —son nuestras cuentas de cobro—, pero va detrás del
   * token igual: no hay razón para publicar dónde cobramos.
   */
  @Roles('adm')
  @Get('payment-instructions')
  getPaymentInstructions(): PaymentInstructionsResponse {
    return this.paymentsService.getPaymentInstructions();
  }

  /**
   * SUB-11: el dueño fija el plan que quiere, cualquier día de la prueba o de
   * la gracia.
   *
   * No cobra ni activa nada: solo deja escrito qué plan eligió, que es lo que
   * después se le cotiza y se le factura. Devuelve el acceso completo para que
   * la pantalla se repinte de una sola llamada.
   *
   * Durante la prueba SIGUE con el Full aunque elija el Básico: los límites del
   * plan elegido rigen recién cuando su pago se verifique.
   */
  @Roles('adm')
  @Patch('plan')
  async choosePlan(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChoosePlanDto,
  ): Promise<AccessResponse> {
    const companyId = await this.entitlements.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    await this.subscriptionService.choosePlan(companyId, dto.planId);
    return this.entitlements.getAccessResponse(companyId);
  }

  /**
   * SUB-10: emite el documento de cobro en Cobrix y devuelve su enlace de pago.
   *
   * Va SEPARADO de la cotización a propósito: cotizar no escribe ni llama a
   * nadie, y emitir un cobro real es una acción explícita del dueño. Pulsarlo
   * dos veces no emite dos facturas — mientras haya una viva se devuelve la
   * misma.
   *
   * Lo importante del orden: la factura tiene que existir ANTES de que el dueño
   * pague. Cobrix concilia los movimientos del banco contra documentos
   * ABIERTOS; sin documento, el pago que entra es plata que ve pero no sabe a
   * quién aplicar.
   */
  @Roles('adm')
  @Post('payments/checkout')
  @HttpCode(HttpStatus.CREATED)
  async startCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StartCheckoutDto,
  ): Promise<CheckoutResponse> {
    const companyId = await this.paymentsService.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.checkout.startCheckout(companyId, dto);
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

  /**
   * SUB-13: todo lo que el dueño ha pagado, del más reciente al más viejo.
   *
   * Vienen los tres estados —verificado, rechazado y por verificar— con el
   * ciclo de facturación que cubrió cada uno, más la cabecera de su
   * suscripción para que la pantalla se pinte de una sola llamada.
   *
   * Solo sus pagos: la consulta va atada al `companyId` que sale del token, no
   * a ningún parámetro. No hay forma de pedir el historial de otro salón.
   */
  @Roles('adm')
  @Get('billing-history')
  async getBillingHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
  ): Promise<BillingHistoryResponse> {
    const companyId = await this.entitlements.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.billingHistory.list(companyId, query);
  }

  /**
   * SUB-13: el detalle de UNO de sus pagos, con los datos del método y el
   * comprobante.
   *
   * El id de otro tenant devuelve 404, no 403: un 403 confirmaría que ese pago
   * existe, y eso ya es información de otro salón.
   */
  @Roles('adm')
  @Get('billing-history/:reportId')
  async getBillingHistoryDetail(
    @Req() req: AuthenticatedRequest,
    @Param('reportId', ParseIntPipe) reportId: number,
  ): Promise<BillingHistoryDetail> {
    const companyId = await this.entitlements.resolveCompanyIdForAdmin(
      req.user.sub,
    );
    return this.billingHistory.detail(companyId, reportId);
  }
}
