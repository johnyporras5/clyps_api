import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { escapeHtml } from '../email/email-layout';
import {
  CampaignEmailService,
  type CampaignPreview,
} from './campaign-email.service';
import { isCampaignId, type CampaignId } from './campaign-email.template';
import { decodeEmailParam, verifyUnsubscribe } from './unsubscribe-token.util';

class SendTestDto {
  @IsEmail()
  @MaxLength(245)
  email: string;
}

function campaignOrFail(value: string): CampaignId {
  if (!isCampaignId(value))
    throw new BadRequestException('Campaña desconocida.');
  return value;
}

/**
 * Campañas de correo desde el panel de plataforma (`padm`): SOLO mirar y mandar
 * pruebas. El envío real es automático (`CampaignEmailTask`); no hay botón
 * para dispararlo a mano, y es a propósito: un clic de más no puede escribirle
 * a todos los salones.
 * `@Roles('padm')` en CADA método: el RolesGuard lee el handler, no la clase.
 */
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCampaignsController {
  constructor(private readonly campaigns: CampaignEmailService) {}

  /** A cuántos les llegaría, cuántos ya salieron y si se puede enviar. */
  @Roles('padm')
  @Get(':campaign')
  preview(@Param('campaign') campaign: string): Promise<CampaignPreview> {
    return this.campaigns.preview(campaignOrFail(campaign));
  }

  /** Manda UN ejemplo a la dirección indicada (no cuenta como enviado). */
  @Roles('padm')
  @Post(':campaign/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendTest(
    @Param('campaign') campaign: string,
    @Body() dto: SendTestDto,
  ): Promise<void> {
    await this.campaigns.sendTest(campaignOrFail(campaign), dto.email);
  }
}

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - CLYPS</title></head>
<body style="margin:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#334155;">
<div style="max-width:480px;margin:60px auto;padding:32px 24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
<div style="font-size:28px;font-weight:700;letter-spacing:2px;color:#0b1f3a;">CLYPS</div>
<h1 style="font-size:20px;color:#1e293b;margin:24px 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:1.6;">${body}</p></div></body></html>`;

/**
 * La baja de promociones (enlace del pie de los correos). Pública a propósito:
 * la persona no tiene por qué iniciar sesión para darse de baja. Lo que la
 * protege es la FIRMA del enlace, no un token de sesión.
 */
@Controller('public/email')
export class PublicUnsubscribeController {
  constructor(private readonly campaigns: CampaignEmailService) {}

  @Get('unsubscribe')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(
    @Query('e') e: string,
    @Query('t') t: string,
  ): Promise<string> {
    const email = await this.verified(e, t);
    if (!email)
      return page(
        'Enlace no válido',
        'Este enlace está incompleto o fue modificado. Usa el enlace de un correo reciente.',
      );
    return page(
      'Listo, te diste de baja',
      `<strong>${escapeHtml(email)}</strong> ya no recibirá promociones de CLYPS. Los correos de tus citas, pagos y cuenta seguirán llegando normal.`,
    );
  }

  /** Baja de un clic (RFC 8058): Gmail hace un POST al mismo enlace. */
  @Post('unsubscribe')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async oneClick(@Query('e') e: string, @Query('t') t: string): Promise<void> {
    await this.verified(e, t);
  }

  private async verified(e: string, t: string): Promise<string | null> {
    const email = decodeEmailParam(e);
    if (
      !email ||
      !verifyUnsubscribe(email, t, this.campaigns.unsubscribeSecret)
    )
      return null;
    await this.campaigns.optOut(email);
    return email;
  }
}
