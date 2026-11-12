import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OFFER_IDS, type OfferId } from '../config/offers.config';
import { PAYMENT_METHODS, type PaymentMethod } from '../subscription.enums';

/** true cuando el reporte es de Pago Móvil (monto en Bs). */
const isPagoMovil = (dto: ReportPaymentDto): boolean =>
  dto.method === 'pago_movil';

/** true cuando el reporte es en dólares (Binance o PayPal). */
const isUsdMethod = (dto: ReportPaymentDto): boolean =>
  dto.method === 'binance' || dto.method === 'paypal';

/**
 * Reporte de pago del dueño (SUB-3 / CLYP-335).
 *
 * Un solo DTO para los tres métodos: lo que cambia es qué campos son
 * obligatorios, y eso lo resuelve `@ValidateIf` en vez de tres endpoints
 * distintos. Las reglas que cruzan campos (coherencia de moneda, qué termina
 * siendo la referencia) viven en `payment-report.util.ts`.
 *
 * `companyId`, `subscriptionId` y `planId` NO viajan en el body: salen del token
 * y de la suscripción, como en el resto del API.
 */
export class ReportPaymentDto {
  @IsIn([...PAYMENT_METHODS])
  method: PaymentMethod;

  /**
   * Promo Black Friday: qué oferta se quiere. Solo el id —el precio lo pone el
   * servidor—. Se revisa que el salón tenga derecho (`PromoService`).
   */
  @IsOptional()
  @IsIn([...OFFER_IDS])
  offerId?: OfferId;

  /** Pasarse de la promo Básico a Full pagando la diferencia. */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  upgrade?: boolean;

  // ---------------------------------------------------------------------------
  // Pago Móvil — el monto en Bs viene congelado de la cotización (SUB-2)
  // ---------------------------------------------------------------------------

  /** Céntimos de Bs cotizados. El backend revalida que cuadren con la tasa. */
  @ValidateIf(isPagoMovil)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountVesMinor?: number;

  /** Tasa Bs por 1 USD usada al cotizar (794.9917). */
  @ValidateIf(isPagoMovil)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  frozenRate?: number;

  /** ISO de cuándo se cotizó: con esto se valida que no esté vencida. */
  @ValidateIf(isPagoMovil)
  @IsDateString()
  quotedAt?: string;

  /** Referencia del Pago Móvil. */
  @ValidateIf(isPagoMovil)
  @IsString()
  @Length(4, 64)
  reference?: string;

  /** Teléfono desde el que se pagó. */
  @ValidateIf(isPagoMovil)
  @IsString()
  @Length(7, 20)
  payerPhone?: string;

  /** Código del banco emisor (0102, 0134…). */
  @ValidateIf(isPagoMovil)
  @IsString()
  @Length(3, 8)
  payerBankCode?: string;

  // ---------------------------------------------------------------------------
  // Binance / PayPal — monto en USD
  // ---------------------------------------------------------------------------

  /** Centavos de USD pagados. */
  @ValidateIf(isUsdMethod)
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountUsdMinor?: number;

  /**
   * Hash de la transacción (Binance) o id de la captura (PayPal). Es lo que
   * permite verificar el pago y lo que evita reportarlo dos veces.
   */
  @ValidateIf(isUsdMethod)
  @IsString()
  @Length(6, 64)
  txId?: string;

  /** Red usada en Binance (BEP20, TRC20…). Ayuda a ubicar la transacción. */
  @IsOptional()
  @IsString()
  @Length(2, 20)
  network?: string;

  /** Correo del pagador en PayPal. Complementa al txId, no lo sustituye. */
  @IsOptional()
  @IsEmail()
  @MaxLength(145)
  payerEmail?: string;

  // ---------------------------------------------------------------------------
  // Comunes
  // ---------------------------------------------------------------------------

  /** Comprobante (imagen). Recomendado: acelera la verificación manual. */
  @IsOptional()
  @IsUrl()
  @MaxLength(245)
  proofUrl?: string;

  /** Aclaratoria libre del dueño ("pagué desde la cuenta de mi esposa"). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
