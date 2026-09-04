import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CobrixWebhookService, type CobrixAck } from './cobrix-webhook.service';
import { CobrixConfig } from './cobrix.config';

/**
 * Los endpoints que llama Cobrix (SUB-10).
 *
 * SIN `JwtAuthGuard` a propósito: quien llama es Cobrix, no un usuario de la
 * app; no hay token que presentar. Lo que autentica la llamada es la FIRMA
 * HMAC del cuerpo, que verifica el servicio antes de mirar nada del payload.
 *
 * `@SkipThrottle` porque los reintentos de Cobrix llegan en ráfaga desde una
 * sola IP: un 429 haría que reintente en bucle un evento que sí podíamos
 * procesar.
 *
 * Se responde SIEMPRE con 2xx cuando el evento se pudo interpretar, aunque no
 * casara con ninguna factura: Cobrix corta los reintentos con cualquier 2xx y
 * reintenta ante 4xx/5xx o si tardamos más de 30 s. Un evento que no casa no
 * mejora por reintentarlo, así que se registra y se contesta 200.
 *
 * `req.rawBody` son los bytes exactos que firmó Cobrix. Se habilita en
 * `main.ts` (`NestFactory.create(..., { rawBody: true })`); sin eso ninguna
 * firma cuadraría.
 */
@Controller('webhooks/cobrix')
export class CobrixWebhookController {
  constructor(
    private readonly webhook: CobrixWebhookService,
    private readonly cobrix: CobrixConfig,
  ) {}

  /**
   * `POST /webhooks/cobrix` — canal de DOCUMENTOS (`cobrix_invoice_v1`). Es el
   * que confirma el cobro con `invoice.paid`, y por eso ocupa la ruta principal.
   *
   * Firma: HMAC-SHA256 del cuerpo crudo, sin timestamp, en `x-cobrix-signature`.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  receiveInvoice(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-cobrix-signature') signature?: string,
  ): Promise<CobrixAck> {
    return this.webhook.handleInvoiceWebhook(request.rawBody, signature);
  }

  /**
   * `POST /webhooks/cobrix/general` — canal GENERAL.
   *
   * ⚠️ Es OTRO canal con OTRA firma (`t=…,v1=…` sobre `timestamp.cuerpo`) y
   * OTRO secreto. Solo avisa que el dueño terminó el checkout; no confirma
   * ningún cobro.
   */
  @Post('general')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  receiveGeneral(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-cobrix-signature') signature?: string,
    @Headers('x-cobrix-timestamp') timestamp?: string,
  ): Promise<CobrixAck> {
    return this.webhook.handleGeneralWebhook(request.rawBody, {
      signature,
      timestamp,
    });
  }

  /**
   * La misma ruta de documentos con un segmento secreto, para que el endpoint
   * no sea adivinable desde fuera. Es una capa cosmética: la firma sigue siendo
   * lo que decide. Si `COBRIX_WEBHOOK_PATH_TOKEN` no está configurado, el token
   * sobra y se ignora.
   */
  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  receiveInvoiceWithToken(
    @Req() request: RawBodyRequest<Request>,
    @Param('token') token: string,
    @Headers('x-cobrix-signature') signature?: string,
  ): Promise<CobrixAck> {
    const expected = this.cobrix.pathToken;
    // 404 y no 401: a un escáner no se le confirma que la ruta existe.
    if (expected && token !== expected)
      throw new NotFoundException(`Cannot POST /webhooks/cobrix/${token}`);
    return this.webhook.handleInvoiceWebhook(request.rawBody, signature);
  }
}
