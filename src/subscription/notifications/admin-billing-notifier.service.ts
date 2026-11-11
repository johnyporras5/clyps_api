import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { WEB_APP_URL } from '../config/app-links.config';
import {
  type AdminBillingEmail,
  type AdminBillingEmailOptions,
  buildTrialExtendedEmail,
  buildVipGrantedEmail,
} from './admin-billing-email.template';

interface OwnerRow {
  companyName: string | null;
  ownerEmail: string | null;
  companyEmail: string | null;
}

/**
 * Le escribe al dueño cuando la plataforma lo hace VIP o le regala días de
 * prueba desde el panel.
 *
 * Nunca lanza: el cambio ya está guardado cuando se llama, y un correo que no
 * sale no puede deshacerlo ni devolverle un error al panel. Lo que falle queda
 * en el log.
 *
 * Solo se llama cuando el cambio SÍ ocurrió (`changed`): un segundo clic en
 * "Hacer VIP" sobre un salón que ya lo era no manda otro correo.
 */
@Injectable()
export class AdminBillingNotifierService {
  private readonly logger = new Logger(AdminBillingNotifierService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async vipGranted(companyId: number, since: Date): Promise<void> {
    await this.send(companyId, 'VIP', (companyName, opts) =>
      buildVipGrantedEmail({ companyName, since }, opts),
    );
  }

  async trialExtended(
    companyId: number,
    trialEndsAt: Date,
    opened: boolean,
  ): Promise<void> {
    await this.send(companyId, 'prueba extendida', (companyName, opts) =>
      buildTrialExtendedEmail({ companyName, trialEndsAt, opened }, opts),
    );
  }

  private get options(): AdminBillingEmailOptions {
    const str = (key: string): string | null =>
      this.config.get<string>(key)?.trim() || null;
    return {
      webUrl: WEB_APP_URL,
      assetsBaseUrl: str('ASSETS_BASE_URL'),
      supportWhatsapp: str('CLYPS_SUPPORT_WHATSAPP'),
    };
  }

  private async send(
    companyId: number,
    what: string,
    build: (
      companyName: string,
      opts: AdminBillingEmailOptions,
    ) => AdminBillingEmail,
  ): Promise<void> {
    try {
      const owner = await this.owner(companyId);
      const to = owner?.ownerEmail?.trim() || owner?.companyEmail?.trim();
      if (!owner || !to) {
        this.logger.warn(
          `Correo de ${what} no enviado: el salón ${companyId} no tiene correo de dueño ni del negocio.`,
        );
        return;
      }

      const mail = build(
        owner.companyName?.trim() || `Salón ${companyId}`,
        this.options,
      );
      // `sendEmail` ya calla a los salones desactivados y no lanza.
      const sent = await this.email.sendEmail(to, mail.subject, mail.html);
      if (!sent)
        this.logger.warn(
          `Correo de ${what} al salón ${companyId} no salió (ver log de EmailService).`,
        );
    } catch (error) {
      this.logger.error(
        `Correo de ${what} al salón ${companyId} falló: ${(error as Error).message}`,
      );
    }
  }

  /**
   * El correo del USUARIO dueño primero (con el que entra a CLYPS, igual que
   * el rescate de onboarding); si no hay, el del negocio.
   */
  private async owner(companyId: number): Promise<OwnerRow | null> {
    const rows: OwnerRow[] = await this.dataSource.query(
      `SELECT co.name  AS companyName,
              u.email  AS ownerEmail,
              co.email AS companyEmail
         FROM company co
         LEFT JOIN user u ON u.id = co.user_id
        WHERE co.id = ?
        LIMIT 1`,
      [companyId],
    );
    return rows[0] ?? null;
  }
}
