import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { BUSINESS_TIMEZONE } from '../common/utils/business-time.util';
import {
  emailApp,
  emailCard,
  emailCode,
  emailContact,
  emailList,
  emailNote,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from './email-layout';
import { DeactivatedCompaniesService } from '../company_deactivation/deactivated-companies.service';

/**
 * Un servicio dentro del correo de una cita. Una cita puede tener varios, y va
 * UN SOLO correo por cita (no uno por servicio).
 */
export interface SessionEmailService {
  name: string;
  /** Hora de inicio del servicio, ya localizada (ej. "9:25 AM"). */
  time: string;
  /** Duración en minutos. */
  duration: number;
  cost: number;
  currency?: string;
  /** Sólo se muestra cuando el correo cubre varios trabajadores. */
  workerName?: string;
  /** Servicio de cortesía (gratis): en el correo sale "Cortesía", no el precio. */
  isCourtesy?: boolean;
}

/** Datos de la cita comunes a los correos de cliente, trabajador y admin. */
export interface SessionEmailData {
  /** Fecha de la cita, ya localizada (ej. "Martes, 28 de julio de 2026"). */
  date: string;
  /** Hora de inicio de la cita, ya localizada. */
  time: string;
  services: SessionEmailService[];
  /** Suma de los servicios incluidos en el correo. */
  totalCost: number;
  /** Duración total de la cita en minutos. */
  totalDuration: number;
  currency?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private readonly fromEmail: string;

  constructor(
    private configService: ConfigService,
    private readonly deactivatedCompanies: DeactivatedCompaniesService,
  ) {
    const apiKey = this.configService.get('RESEND_API_KEY');
    const domain = this.configService.get('RESEND_DOMAIN', 'example.com');

    if (!apiKey) {
      this.logger.error(
        'RESEND_API_KEY no está configurada en las variables de entorno',
      );
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get(
      'RESEND_FROM_EMAIL',
      `Your App <no-reply@${domain}>`,
    );
    this.logger.log(`Resend inicializado correctamente con dominio: ${domain}`);
  }

  /**
   * Badges oficiales de Google Play y App Store para las plantillas de correo.
   *
   * Se sirven como PNG desde `ASSETS_BASE_URL/email/` (los SVG originales viven
   * en `assets/email/` del repo): los clientes de correo no renderizan SVG ni
   * data URIs, así que la imagen tiene que venir de una URL pública.
   *
   * Los badges van como `inline-block` y no en celdas de una tabla: en pantallas
   * angostas una tabla de dos celdas no parte de línea y el segundo badge se sale
   * del correo. Así, cuando no caben lado a lado, el segundo baja solo. El
   * `font-size: 0` del contenedor elimina el espacio en blanco entre ambos.
   */
  private renderStoreBadges(): string {
    const base = (
      this.configService.get<string>('ASSETS_BASE_URL') ||
      'http://localhost:4000/assets'
    ).replace(/\/+$/, '');

    const badge = (
      href: string,
      file: string,
      alt: string,
    ): string => `<a href="${href}" target="_blank" style="display: inline-block; margin: 0 5px 10px; text-decoration: none;">
                              <img src="${base}/email/${file}" alt="${alt}" width="135" height="40" style="display: block; width: 135px; max-width: 100%; height: auto; border: 0; outline: none;" />
                          </a>`;

    return `
                      <div style="text-align: center; font-size: 0; line-height: 0;">
                          ${badge(
                            'https://play.google.com/store/apps/details?id=com.datamobility.clypsmobile',
                            'google-play.png',
                            'Disponible en Google Play',
                          )}
                          ${badge(
                            'https://apps.apple.com/us/app/clyps/id6782667705',
                            'app-store.png',
                            'Descargar en el App Store',
                          )}
                      </div>`;
  }

  /**
   * El acceso al sistema web es sólo para administradores: clientes y
   * trabajadores usan la app. Estas plantillas (verificación, reseteo y cambio
   * de contraseña) las recibe cualquier usuario, así que el enlace se decide por
   * `userType`, no por plantilla. Si no se sabe el tipo, no se muestra.
   */
  private isAdmin(userType?: string): boolean {
    return userType === 'adm';
  }

  /**
   * Red de seguridad de los salones desactivados: el dueño y los trabajadores
   * de un salón desactivado no reciben NINGÚN correo, venga de donde venga.
   * Los cron ya los filtran en origen; esto atrapa lo que se escape, incluido
   * cualquier correo nuevo que se agregue mañana sin acordarse del filtro.
   *
   * Pasa por aquí cada envío a Resend de este archivo; uno nuevo tiene que
   * llamarlo también. Si la consulta falla, el correo sale: perder un correo
   * legítimo por un fallo de la base es peor que mandar uno de más.
   */
  private async isSilenced(to: string): Promise<boolean> {
    try {
      if (!(await this.deactivatedCompanies.isEmailSilenced(to))) return false;
    } catch (error) {
      this.logger.warn(
        `No se pudo comprobar si ${to} está desactivado; se envía igual: ${(error as Error).message}`,
      );
      return false;
    }
    this.logger.log(`Correo a ${to} omitido: su salón está desactivado`);
    return true;
  }

  async sendVerificationCode(
    email: string,
    code: string,
    username: string,
    userType?: string,
  ): Promise<boolean> {
    return this.sendCodeEmail(
      email,
      code,
      username,
      'Verifica tu cuenta',
      this.getVerificationEmailTemplate(username, code, userType),
    );
  }

  async sendPasswordResetCode(
    email: string,
    code: string,
    username: string,
    userType?: string,
  ): Promise<boolean> {
    return this.sendCodeEmail(
      email,
      code,
      username,
      'Restablecer contraseña',
      this.getPasswordResetEmailTemplate(username, code, userType),
    );
  }

  private async sendCodeEmail(
    email: string,
    code: string,
    username: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error(
          'Resend no está inicializado. Verifica RESEND_API_KEY',
        );
        return false;
      }

      if (await this.isSilenced(email)) return false;

      this.logger.log(`Enviando código ${code} a ${email}`);

      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html,
      });

      if (error) {
        this.logger.error('Error de Resend:', error);
        return false;
      }

      this.logger.log(`✅ Email (${subject}) enviado exitosamente`);
      return true;
    } catch (error) {
      this.logger.error('Error inesperado enviando email:', error);
      return false;
    }
  }

  async sendPasswordChangedNotification(
    email: string,
    username: string,
    userType?: string,
  ): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error(
          'Resend no está inicializado. Verifica RESEND_API_KEY',
        );
        return false;
      }

      if (await this.isSilenced(email)) return false;

      this.logger.log(
        `Enviando notificación de cambio de contraseña a ${email}`,
      );

      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Contraseña cambiada',
        html: this.getPasswordChangedEmailTemplate(username, userType),
      });

      if (error) {
        this.logger.error('Error de Resend al enviar notificación:', error);
        return false;
      }

      this.logger.log('✅ Notificación de cambio de contraseña enviada');
      return true;
    } catch (error) {
      this.logger.error('Error inesperado enviando notificación:', error);
      return false;
    }
  }
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error(
          'Resend no está inicializado. Verifica RESEND_API_KEY',
        );
        return false;
      }

      if (await this.isSilenced(to)) return false;

      this.logger.log(`Enviando email a ${to} con asunto: ${subject}`);

      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: to,
        subject: subject,
        html: html,
      });

      if (error) {
        this.logger.error('Error de Resend:', error);
        return false;
      }

      this.logger.log(`✅ Email enviado exitosamente a ${to}`);
      return true;
    } catch (error) {
      this.logger.error('Error inesperado enviando email:', error);
      return false;
    }
  }

  /**
   * Aviso al cliente de que la HORA de su cita se modificó (arrastre / ripple).
   * Usa la MISMA plantilla que la confirmación (variante "reschedule"), con el
   * nuevo horario ya localizado a la zona del negocio, para que el cliente vea
   * todos los detalles en el correo sin tener que abrir la app.
   */
  async sendSessionRescheduleToClient(
    clientEmail: string,
    clientName: string,
    sessionData: SessionEmailData,
    workerInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionConfirmationTemplate(
      clientName,
      sessionData,
      workerInfo,
      companyInfo,
      'reschedule',
    );

    return this.sendEmail(
      clientEmail,
      `Cita reprogramada - ${sessionData.date}`,
      html,
    );
  }

  async sendSessionConfirmationToClient(
    clientEmail: string,
    clientName: string,
    sessionData: SessionEmailData,
    workerInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionConfirmationTemplate(
      clientName,
      sessionData,
      workerInfo,
      companyInfo,
    );

    return this.sendEmail(
      clientEmail,
      `Confirmación de cita - ${sessionData.date}`,
      html,
    );
  }

  async sendSessionNotificationToWorker(
    workerEmail: string,
    workerName: string,
    sessionData: SessionEmailData & {
      clientName: string;
      clientPhone?: string;
    },
    clientInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionNotificationTemplate(
      workerName,
      sessionData,
      clientInfo,
      companyInfo,
    );

    return this.sendEmail(
      workerEmail,
      `Nueva cita asignada - ${sessionData.date}`,
      html,
    );
  }

  async sendSessionNotificationToAdmin(
    adminEmail: string,
    adminName: string,
    sessionData: SessionEmailData,
    clientInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
    workers: Array<{
      name: string;
      email?: string;
      phone?: string;
    }>,
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionAdminNotificationTemplate(
      adminName,
      sessionData,
      clientInfo,
      workers,
      companyInfo,
    );

    return this.sendEmail(
      adminEmail,
      `📋 Nueva cita agendada - ${sessionData.date}`,
      html,
    );
  }

  /** Texto de la tarjeta "Servicio": el nombre, o cuántos son si hay varios. */
  private servicesSummary(services: SessionEmailService[]): string {
    if (services.length === 0) return 'Servicio';
    if (services.length === 1) return services[0].name;
    return `${services.length} servicios`;
  }

  /**
   * Detalle de los servicios de la cita (hora · nombre · profesional · duración
   * · precio). Se omite cuando hay uno solo: ya sale en las tarjetas.
   */
  private renderServicesList(
    services: SessionEmailService[],
    accentColor: string,
  ): string {
    if (services.length < 2) return '';

    const rows = services
      .map((service, index) => {
        const isLast = index === services.length - 1;
        const border = isLast ? '' : 'border-bottom: 1px solid #f1f5f9;';
        const meta = [`${service.duration} minutos`, service.workerName]
          .filter(Boolean)
          .join(' · ');
        return `
                        <tr>
                            <td style="padding: 14px 18px; ${border}">
                                <div style="font-size: 15px; font-weight: 600; color: #1e293b;">${service.time} · ${service.name}</div>
                                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${meta}</div>
                            </td>
                            <td align="right" style="padding: 14px 18px; ${border} font-size: 15px; font-weight: 600; color: ${accentColor}; white-space: nowrap;">${this.priceOrCourtesy(service.isCourtesy, service.cost, service.currency)}</td>
                        </tr>`;
      })
      .join('');

    return `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; margin: 0 0 25px 0;">
                        <tr>
                            <td colspan="2" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Servicios de la cita</td>
                        </tr>${rows}
                    </table>`;
  }

  /** Símbolo de la moneda del servicio. Fallback: el propio código. */
  private currencySymbol(currency?: string | null): string {
    const code = (currency || 'USD').toUpperCase();
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      VES: 'Bs',
    };
    return symbols[code] ?? `${code} `;
  }

  /** Precio con el símbolo de la moneda del servicio (ej.: "€100.00"). */
  private formatMoney(amount: number, currency?: string | null): string {
    return `${this.currencySymbol(currency)}${(amount ?? 0).toFixed(2)}`;
  }

  /** Precio del servicio, o "Cortesía" si es un servicio de cortesía (gratis). */
  private priceOrCourtesy(
    isCourtesy: boolean | undefined,
    amount: number,
    currency?: string | null,
  ): string {
    return isCourtesy ? 'Cortesía' : this.formatMoney(amount, currency);
  }

  /**
   * Total de la cita para el correo. Si TODOS los servicios son de cortesía,
   * muestra "Cortesía" en lugar de un monto (que sería 0).
   */
  private totalCostDisplay(sessionData: SessionEmailData): string {
    const services = sessionData.services ?? [];
    const allCourtesy =
      services.length > 0 && services.every((s) => s.isCourtesy);
    return allCourtesy
      ? 'Cortesía'
      : this.formatMoney(sessionData.totalCost, sessionData.currency);
  }

  formatSessionDate(date: Date): { date: string; time: string } {
    const sessionDate = new Date(date);

    // El instante se guarda en UTC; para el correo hay que mostrarlo en la zona
    // del negocio, si no en producción (servidor UTC) la hora sale +4h.
    const dateStr = sessionDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: BUSINESS_TIMEZONE,
    });

    // Hora en formato 12h con AM/PM (estilo de la app), en la zona del negocio.
    const timeStr = sessionDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: BUSINESS_TIMEZONE,
    });

    return {
      date: dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
      time: timeStr,
    };
  }

  // ============ CANCELACIÓN DE CITAS ============

  /**
   * Envía correo de cancelación al cliente
   */
  async sendSessionCancellationToClient(
    clientEmail: string,
    clientName: string,
    sessionData: {
      date: string;
      time: string;
      reason: string;
    },
    companyInfo: {
      name: string;
      email?: string;
      address?: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionCancellationClientTemplate(
      clientName,
      sessionData,
      companyInfo,
    );

    return this.sendEmail(
      clientEmail,
      `❌ Cita cancelada - ${sessionData.date}`,
      html,
    );
  }

  /**
   * Envía correo de cancelación al trabajador
   */
  async sendSessionCancellationToWorker(
    workerEmail: string,
    workerName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
      reason: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionCancellationWorkerTemplate(
      workerName,
      sessionData,
    );

    return this.sendEmail(
      workerEmail,
      `❌ Cita cancelada - ${sessionData.date}`,
      html,
    );
  }

  /** Correo de REACTIVACIÓN de la cita al cliente (la cita vuelve a estar activa). */
  async sendSessionReactivationToClient(
    clientEmail: string,
    clientName: string,
    sessionData: { date: string; time: string },
    companyInfo: { name: string; email?: string; address?: string },
  ): Promise<boolean> {
    const html = this.getSessionReactivationClientTemplate(
      clientName,
      sessionData,
      companyInfo,
    );
    return this.sendEmail(
      clientEmail,
      `✅ Cita reactivada - ${sessionData.date}`,
      html,
    );
  }

  /** Correo de REACTIVACIÓN de la cita al trabajador. */
  async sendSessionReactivationToWorker(
    workerEmail: string,
    workerName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
    },
  ): Promise<boolean> {
    const html = this.getSessionReactivationWorkerTemplate(
      workerName,
      sessionData,
    );
    return this.sendEmail(
      workerEmail,
      `✅ Cita reactivada - ${sessionData.date}`,
      html,
    );
  }

  async sendLinkBookingReceivedToClient(
    clientEmail: string,
    clientName: string,
    data: {
      date: string;
      time: string;
      services: string[];
      status: 'pending_approval' | 'pending_payment';
      expiresAt: string | null;
      deposit: { amount: number; currency: string } | null;
    },
    companyInfo: { name: string; email?: string; address?: string },
  ): Promise<boolean> {
    const isPayment = data.status === 'pending_payment';
    const intro = isPayment
      ? `Recibimos tu solicitud de cita y el comprobante de tu adelanto${
          data.deposit
            ? ` de <strong>${this.formatMoney(data.deposit.amount, data.deposit.currency)}</strong>`
            : ''
        }. <strong>${escapeHtml(companyInfo.name)}</strong> verificará el pago`
      : `Recibimos tu solicitud de cita. <strong>${escapeHtml(companyInfo.name)}</strong> la revisará`;
    const html = this.getLinkBookingTemplate({
      clientName,
      title: isPayment ? 'Pago en verificación' : 'Solicitud recibida',
      accent: '#d97706',
      accentSoft: '#fffbeb',
      cardTitle: '⏳ Cita por aprobar',
      message: `${intro} y te confirmará la cita por <strong>WhatsApp</strong> y por <strong>correo</strong>.`,
      date: data.date,
      time: data.time,
      services: data.services,
      footnote: data.expiresAt
        ? `Guardamos tu horario hasta el ${escapeHtml(data.expiresAt)}. Si no se confirma antes, se libera.`
        : null,
      companyInfo,
    });
    return this.sendEmail(
      clientEmail,
      `⏳ Solicitud de cita recibida - ${data.date}`,
      html,
    );
  }

  async sendLinkBookingNotConfirmedToClient(
    clientEmail: string,
    clientName: string,
    data: {
      date: string;
      time: string;
      services: string[];
      reason: string | null;
      expired: boolean;
    },
    companyInfo: { name: string; email?: string; address?: string },
  ): Promise<boolean> {
    const company = escapeHtml(companyInfo.name);
    const html = this.getLinkBookingTemplate({
      clientName,
      title: 'Cita no confirmada',
      accent: '#dc2626',
      accentSoft: '#fef2f2',
      cardTitle: '❌ Cita no confirmada',
      message: data.expired
        ? `Tu solicitud de cita en <strong>${company}</strong> no se confirmó a tiempo, así que el horario quedó libre. Si aún quieres la cita, puedes reservar de nuevo.`
        : `<strong>${company}</strong> no pudo confirmar tu solicitud de cita.${
            data.reason ? ` Motivo: <em>${escapeHtml(data.reason)}</em>.` : ''
          }`,
      date: data.date,
      time: data.time,
      services: data.services,
      footnote: null,
      companyInfo,
    });
    return this.sendEmail(
      clientEmail,
      `❌ Cita no confirmada - ${data.date}`,
      html,
    );
  }

  private getLinkBookingTemplate(p: {
    clientName: string;
    title: string;
    accent: string;
    accentSoft: string;
    cardTitle: string;
    message: string;
    date: string;
    time: string;
    services: string[];
    footnote: string | null;
    companyInfo: { name: string; email?: string; address?: string };
  }): string {
    const services = p.services.filter(Boolean).map(escapeHtml).join(', ');
    return this.renderStatusEmail({
      title: p.title,
      accent: p.accent,
      accentSoft: p.accentSoft,
      greeting: `Hola ${escapeHtml(p.clientName)},`,
      message: p.message,
      cardTitle: p.cardTitle,
      details: [
        { label: '📅 Fecha', value: p.date },
        { label: '🕐 Hora', value: p.time },
        ...(services
          ? [
              {
                label: p.services.length === 1 ? '✂️ Servicio' : '✂️ Servicios',
                value: services,
              },
            ]
          : []),
      ],
      footnote: p.footnote,
      companyInfo: p.companyInfo,
    });
  }

  private renderEmail(p: Parameters<typeof renderEmail>[0]): string {
    return renderEmail(p);
  }

  private emailCard(p: Parameters<typeof emailCard>[0]): string {
    return emailCard(p);
  }

  private emailNote(p: Parameters<typeof emailNote>[0]): string {
    return emailNote(p);
  }

  private emailList(items: string[], ordered = false): string {
    return emailList(items, ordered);
  }

  private emailCode(p: Parameters<typeof emailCode>[0]): string {
    return emailCode(p);
  }

  private emailParagraph(html: string, muted = false): string {
    return emailParagraph(html, muted);
  }

  private emailApp(p: {
    title: string;
    text: string;
    userType?: string;
  }): string {
    return emailApp({
      title: p.title,
      text: p.text,
      badges: this.renderStoreBadges(),
      showWebLink: this.isAdmin(p.userType),
    });
  }

  private emailContact(info: Parameters<typeof emailContact>[0]): string {
    return emailContact(info);
  }

  private renderStatusEmail(p: {
    title: string;
    accent: string;
    accentSoft: string;
    greeting: string;
    message: string;
    cardTitle: string;
    details: { label: string; value: string }[];
    note?: { label: string; value: string } | null;
    footnote?: string | null;
    closing?: string | null;
    companyInfo?: { name: string; email?: string; address?: string } | null;
  }): string {
    return this.renderEmail({
      title: p.title,
      accent: p.accent,
      greeting: p.greeting,
      message: p.message,
      blocks: [
        this.emailCard({
          title: p.cardTitle,
          accent: p.accent,
          accentSoft: p.accentSoft,
          rows: p.details,
          extra: p.note
            ? this.emailNote({
                title: p.note.label,
                body: p.note.value,
                accent: p.accent,
                background: '#ffffff',
              })
            : '',
        }),
        p.footnote
          ? `<div style="font-size:14px;line-height:1.6;color:#64748b;margin:0 0 20px 0;">${p.footnote}</div>`
          : '',
        p.closing ? this.emailParagraph(p.closing) : '',
        p.companyInfo ? this.emailContact(p.companyInfo) : '',
      ],
    });
  }

  private getSessionReactivationClientTemplate(
    clientName: string,
    sessionData: { date: string; time: string },
    companyInfo: { name: string; email?: string; address?: string },
  ): string {
    return this.renderStatusEmail({
      title: 'Cita reactivada',
      accent: '#059669',
      accentSoft: '#ecfdf5',
      greeting: `Hola ${escapeHtml(clientName)},`,
      message:
        '¡Buenas noticias! Tu cita que había sido cancelada volvió a estar <strong>activa</strong>. Te esperamos en la fecha y hora indicadas.',
      cardTitle: '✅ Cita reactivada',
      details: [
        { label: '📅 Fecha', value: sessionData.date },
        { label: '🕐 Hora', value: sessionData.time },
      ],
      companyInfo,
    });
  }

  private getSessionReactivationWorkerTemplate(
    workerName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
    },
  ): string {
    return this.renderStatusEmail({
      title: 'Cita reactivada',
      accent: '#059669',
      accentSoft: '#ecfdf5',
      greeting: `Hola ${escapeHtml(workerName)},`,
      message:
        'Una cita que había sido cancelada volvió a estar activa en tu agenda.',
      cardTitle: '✅ Cita reactivada',
      details: [
        { label: '📅 Fecha', value: sessionData.date },
        { label: '🕐 Hora', value: sessionData.time },
        { label: '💼 Servicio', value: escapeHtml(sessionData.serviceName) },
        { label: '👤 Cliente', value: escapeHtml(sessionData.clientName) },
      ],
    });
  }

  private getVerificationEmailTemplate(
    username: string,
    code: string,
    userType?: string,
  ): string {
    return this.renderEmail({
      title: 'Verificación de cuenta',
      accent: '#1d4ed8',
      greeting: `Hola ${escapeHtml(username)},`,
      message:
        'Te damos la bienvenida a CLYPS. Para completar tu registro y comenzar a usar todas las funciones del sistema, verifica tu cuenta con el siguiente código:',
      blocks: [
        this.emailCode({
          label: 'Código de verificación',
          code,
          accent: '#1d4ed8',
        }),
        this.emailNote({
          title: '⏰ Validez',
          body: 'Este código tiene una validez de 15 minutos.',
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailApp({
          title: '📱 ¡Descarga nuestra app móvil!',
          text: 'Para una mejor experiencia, gestiona tus citas desde tu teléfono. Descarga la app de CLYPS disponible en:',
          userType,
        }),
        this.emailParagraph(
          'Si no solicitaste este código, puedes ignorar este mensaje de manera segura.',
          true,
        ),
      ],
    });
  }

  private getPasswordResetEmailTemplate(
    username: string,
    code: string,
    userType?: string,
  ): string {
    return this.renderEmail({
      title: 'Restablecer contraseña',
      accent: '#dc2626',
      greeting: `Hola ${escapeHtml(username)},`,
      message:
        'Recibimos una solicitud para restablecer la contraseña de tu cuenta CLYPS. Para continuar, usa el siguiente código de verificación:',
      blocks: [
        this.emailCode({
          label: 'Código de restablecimiento',
          code,
          accent: '#dc2626',
        }),
        this.emailNote({
          title: '⏰ Este código expira en 15 minutos.',
          body: '',
          accent: '#dc2626',
          background: '#fef2f2',
        }),
        this.emailNote({
          title: '⚠️ Medidas de seguridad',
          body: 'Este código es personal e intransferible. No lo compartas con nadie. Si no solicitaste este cambio, ignora este mensaje y verifica la seguridad de tu cuenta.',
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailApp({
          title: '📱 ¿Sabías que tenemos app móvil?',
          text: 'Restablece tu contraseña más fácilmente desde nuestra app. Descárgala y gestiona tu cuenta desde cualquier lugar:',
          userType,
        }),
        this.emailParagraph(
          'Si necesitas asistencia, nuestro equipo de soporte está disponible para ayudarte.',
          true,
        ),
      ],
      footerNote:
        'Este es un mensaje automático de seguridad. Protegemos tu acceso y tus datos personales.',
    });
  }

  private getPasswordChangedEmailTemplate(
    username: string,
    userType?: string,
  ): string {
    const changedAt = new Date().toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: BUSINESS_TIMEZONE,
    });
    return this.renderEmail({
      title: 'Contraseña actualizada',
      accent: '#059669',
      greeting: `Hola ${escapeHtml(username)},`,
      message: 'Tu contraseña fue modificada exitosamente en el sistema CLYPS.',
      blocks: [
        this.emailCard({
          title: '✓ Contraseña actualizada correctamente',
          accent: '#059669',
          accentSoft: '#ecfdf5',
          rows: [{ label: '🕐 Fecha y hora del cambio', value: changedAt }],
          extra: this.emailNote({
            title: '📋 Detalles del cambio',
            body: this.emailList([
              'Cambio de contraseña confirmado',
              'Acceso seguro establecido',
              'Credenciales actualizadas en el sistema',
            ]),
            accent: '#059669',
            background: '#ffffff',
          }),
        }),
        this.emailNote({
          title: '⚠️ Importante: verificación de seguridad',
          body: 'Si no realizaste este cambio, contacta de inmediato a nuestro equipo de soporte para asegurar tu cuenta.',
          accent: '#dc2626',
          background: '#fef2f2',
        }),
        this.emailApp({
          title: '📱 ¡Accede a tu cuenta desde cualquier lugar!',
          text: 'Con nuestra app móvil puedes gestionar tu cuenta y tus citas desde tu teléfono. ¡Descárgala ahora!',
          userType,
        }),
        this.emailParagraph(
          'Esta es una notificación automática para mantenerte informado sobre los cambios en tu cuenta.',
          true,
        ),
      ],
      footerNote: 'Tu seguridad es nuestra máxima prioridad.',
    });
  }

  async sendWorkerCredentials(
    email: string,
    username: string,
    password: string,
    companyName: string,
  ): Promise<boolean> {
    return this.sendCredentialsEmail(
      email,
      username,
      password,
      companyName,
      'Bienvenido a CLYPS - Tus Credenciales de Acceso',
      this.getWorkerCredentialsTemplate(username, password, companyName),
    );
  }

  private async sendCredentialsEmail(
    email: string,
    username: string,
    password: string,
    companyName: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error(
          'Resend no está inicializado. Verifica RESEND_API_KEY',
        );
        return false;
      }

      if (await this.isSilenced(email)) return false;

      this.logger.log(
        `Enviando credenciales a ${email} para la compañía ${companyName}`,
      );

      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html,
      });

      if (error) {
        this.logger.error('Error de Resend:', error);
        return false;
      }

      this.logger.log(
        `✅ Credenciales enviadas exitosamente a ${email} para la compañía ${companyName}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Error inesperado enviando credenciales:', error);
      return false;
    }
  }

  private getWorkerCredentialsTemplate(
    username: string,
    password: string,
    companyName: string,
  ): string {
    const company = escapeHtml(companyName);
    return this.renderEmail({
      title: '¡Bienvenido al equipo!',
      accent: '#1d4ed8',
      greeting: `Hola ${escapeHtml(username)},`,
      message: `Te damos la bienvenida a CLYPS. Tu cuenta fue creada exitosamente y quedaste asignado como trabajador en <strong>${company}</strong>. ¡Nos alegra tenerte en el equipo!`,
      blocks: [
        this.emailCard({
          title: '🔑 Tus credenciales de acceso',
          accent: '#1d4ed8',
          accentSoft: '#eff6ff',
          rows: [
            { label: '🏢 Compañía asignada', value: company },
            { label: '👤 Usuario / Email', value: escapeHtml(username) },
            { label: '🔒 Contraseña temporal', value: escapeHtml(password) },
          ],
        }),
        this.emailNote({
          title: '🚀 Primeros pasos en CLYPS',
          body: this.emailList(
            [
              `<strong>Inicio de sesión:</strong> entra al sistema con las credenciales de arriba. Trabajarás para <strong>${company}</strong>.`,
              '<strong>Verificación de cuenta:</strong> verifica tu cuenta con el código que recibirás por correo. Este paso es esencial para la seguridad de tu acceso.',
              '<strong>Actualización de seguridad:</strong> cambia tu contraseña temporal por una permanente en la sección de Perfil, con una combinación segura de caracteres.',
              `<strong>Configuración de perfil:</strong> completa tu perfil profesional para <strong>${company}</strong> con tu información, especialidades y horarios.`,
            ],
            true,
          ),
          accent: '#1d4ed8',
        }),
        this.emailNote({
          title: '⚠️ Directrices de seguridad',
          body: this.emailList([
            'Esta contraseña es temporal y debes cambiarla apenas entres por primera vez.',
            'No compartas tus credenciales con nadie, incluidos otros miembros del equipo.',
            'Usa contraseñas diferentes para cada servicio y aplicación.',
            `Si detectas actividad sospechosa, contacta de inmediato al administrador de <strong>${company}</strong>.`,
          ]),
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailApp({
          title: '📱 ¡Optimiza tu trabajo con nuestra app!',
          text: 'Descarga la app móvil de CLYPS para gestionar tus citas, clientes y horarios directamente desde tu teléfono.',
        }),
        this.emailParagraph(
          `Para cualquier consulta sobre tu asignación en <strong>${company}</strong>, contacta al administrador de la compañía. Nuestro equipo de soporte también está disponible para ayudarte.`,
        ),
      ],
      footerNote:
        'Este correo contiene información confidencial. Por favor, no lo compartas ni lo reenvíes.',
    });
  }

  async sendClientCredentials(
    email: string,
    username: string,
    password: string,
  ): Promise<boolean> {
    return this.sendCredentialsEmail(
      email,
      username,
      password,
      'CLYPS',
      'Bienvenido a CLYPS - Tus Credenciales de Acceso',
      this.getClientCredentialsTemplate(username, password),
    );
  }

  private getClientCredentialsTemplate(
    username: string,
    password: string,
  ): string {
    return this.renderEmail({
      title: 'Bienvenido a CLYPS',
      accent: '#1d4ed8',
      greeting: `¡Bienvenido/a ${escapeHtml(username)}!`,
      message: 'Tu cuenta de cliente fue creada exitosamente en CLYPS.',
      blocks: [
        this.emailCard({
          title: '🔑 Tus credenciales de acceso',
          accent: '#1d4ed8',
          accentSoft: '#eff6ff',
          rows: [
            { label: '👤 Usuario / Email', value: escapeHtml(username) },
            { label: '🔒 Contraseña temporal', value: escapeHtml(password) },
          ],
        }),
        this.emailNote({
          title: '⚠️ Importante',
          body:
            'Esta contraseña es temporal. Por seguridad, te recomendamos:' +
            this.emailList([
              'Cambiar tu contraseña después del primer inicio de sesión',
              'No compartir tus credenciales con nadie',
              'Verificar tu correo electrónico para activar tu cuenta',
            ]),
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailNote({
          title: 'Próximos pasos',
          body: this.emailList(
            [
              'Inicia sesión en CLYPS con las credenciales de arriba',
              'Verifica tu correo electrónico con el código que recibirás',
              'Completa tu perfil de cliente',
              'Comienza a reservar citas con nuestros profesionales',
            ],
            true,
          ),
          accent: '#1d4ed8',
        }),
        this.emailApp({
          title: '📱 ¡Lleva CLYPS en tu bolsillo!',
          text: 'Reserva y gestiona tus citas fácilmente desde tu teléfono. Descarga nuestra app móvil y ten acceso instantáneo a todos tus servicios.',
        }),
        this.emailParagraph(
          'Si tienes alguna pregunta, no dudes en contactar a nuestro equipo de soporte.',
          true,
        ),
      ],
    });
  }

  private getSessionConfirmationTemplate(
    clientName: string,
    sessionData: SessionEmailData,
    workerInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
    variant: 'confirmation' | 'reschedule' = 'confirmation',
  ): string {
    const isReschedule = variant === 'reschedule';
    const accent = isReschedule ? '#d97706' : '#059669';
    const accentSoft = isReschedule ? '#fffbeb' : '#ecfdf5';
    const services = sessionData.services ?? [];
    const company = escapeHtml(companyInfo.name);
    const contactRows = [
      `<strong>Compañía:</strong> ${company}`,
      companyInfo.address
        ? `<strong>Dirección:</strong> ${escapeHtml(companyInfo.address)}`
        : '',
      companyInfo.email
        ? `<strong>Email de la compañía:</strong> ${escapeHtml(companyInfo.email)}`
        : '',
      `<strong>Profesional:</strong> ${escapeHtml(workerInfo.name)}`,
      workerInfo.phone
        ? `<strong>Teléfono:</strong> ${escapeHtml(workerInfo.phone)}`
        : '',
    ].filter(Boolean);
    return this.renderEmail({
      title: isReschedule ? 'Cita reprogramada' : 'Confirmación de cita',
      accent,
      greeting: `Hola ${escapeHtml(clientName)},`,
      message: isReschedule
        ? `El horario de tu cita en <strong>${company}</strong> fue modificado. Estos son los nuevos detalles de tu cita.`
        : 'Tu cita fue programada exitosamente. Estos son todos los detalles para que estés preparado/a.',
      blocks: [
        this.emailCard({
          title: isReschedule
            ? '📅 Nuevos detalles de tu cita'
            : '📅 Detalles de tu cita',
          accent,
          accentSoft,
          rows: [
            { label: '📅 Fecha', value: sessionData.date },
            { label: '🕐 Hora', value: sessionData.time },
            {
              label: '💼 Servicio',
              value: escapeHtml(this.servicesSummary(services)),
            },
            {
              label: '⏱️ Duración',
              value: `${sessionData.totalDuration} minutos`,
            },
            { label: '💰 Costo', value: this.totalCostDisplay(sessionData) },
            { label: '👤 Profesional', value: escapeHtml(workerInfo.name) },
            ...(companyInfo.address
              ? [
                  {
                    label: '📍 Ubicación',
                    value: escapeHtml(companyInfo.address),
                  },
                ]
              : []),
          ],
          extra: this.renderServicesList(services, accent),
        }),
        this.emailNote({
          title: '📋 Información de contacto',
          body: contactRows.join('<br>'),
          accent,
        }),
        this.emailNote({
          title: '📌 Recordatorios importantes',
          body: this.emailList([
            'Llega 10-15 minutos antes de tu cita',
            'Trae cualquier documento o material necesario',
            'Si vas a cancelar, hazlo con al menos 24 horas de anticipación',
            `Contacta directamente a ${company} si tienes alguna pregunta`,
          ]),
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailApp({
          title: '📱 ¡Gestiona tus citas desde tu teléfono!',
          text: 'Descarga la app de CLYPS para ver, modificar o cancelar tus citas desde cualquier lugar. ¡Es mucho más conveniente!',
        }),
      ],
      footerNote: isReschedule
        ? 'Este es un mensaje automático, por favor no respondas a este correo.'
        : 'Este es un mensaje automático de confirmación, por favor no respondas a este correo.',
    });
  }

  private getSessionNotificationTemplate(
    workerName: string,
    sessionData: SessionEmailData & {
      clientName: string;
      clientPhone?: string;
    },
    clientInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): string {
    const accent = '#059669';
    const services = sessionData.services ?? [];
    const company = escapeHtml(companyInfo.name);
    const clientRows = [
      `<strong>Cliente:</strong> ${escapeHtml(clientInfo.name)}`,
      clientInfo.phone
        ? `<strong>Teléfono:</strong> ${escapeHtml(clientInfo.phone)}`
        : '',
      `<strong>Compañía:</strong> ${company}`,
      companyInfo.address
        ? `<strong>Dirección:</strong> ${escapeHtml(companyInfo.address)}`
        : '',
    ].filter(Boolean);
    return this.renderEmail({
      title: 'Nueva cita asignada',
      accent,
      greeting: `Hola ${escapeHtml(workerName)},`,
      message:
        'Se te asignó una nueva cita. Estos son todos los detalles para que puedas prepararte.',
      blocks: [
        this.emailCard({
          title: '📅 Detalles de la cita',
          accent,
          accentSoft: '#ecfdf5',
          rows: [
            { label: '📅 Fecha', value: sessionData.date },
            { label: '🕐 Hora', value: sessionData.time },
            {
              label: '💼 Servicio',
              value: escapeHtml(this.servicesSummary(services)),
            },
            {
              label: '⏱️ Duración',
              value: `${sessionData.totalDuration} minutos`,
            },
            { label: '💰 Costo', value: this.totalCostDisplay(sessionData) },
            { label: '👤 Cliente', value: escapeHtml(sessionData.clientName) },
            { label: '📍 Ubicación', value: company },
          ],
          extra: this.renderServicesList(services, accent),
        }),
        this.emailNote({
          title: '📋 Información del cliente',
          body: clientRows.join('<br>'),
          accent,
        }),
        this.emailNote({
          title: '📌 Recordatorios importantes',
          body: this.emailList([
            'Confirma tu disponibilidad para esta cita',
            'Prepara todo lo necesario para el servicio',
            'Llega con anticipación a la ubicación',
            'Actualiza el estado de la cita en el sistema después del servicio',
          ]),
          accent: '#d97706',
          background: '#fffbeb',
        }),
        this.emailApp({
          title: '📱 ¡Gestiona tus citas desde tu teléfono!',
          text: 'Descarga la app de CLYPS para ver, modificar o gestionar tus citas desde cualquier lugar. ¡Es mucho más conveniente!',
        }),
        this.emailParagraph(
          `Para cualquier cambio en la cita, contacta al administrador de <strong>${company}</strong>.`,
        ),
      ],
      footerNote:
        'Este es un mensaje automático de notificación, por favor no respondas a este correo.',
    });
  }

  private getSessionCancellationClientTemplate(
    clientName: string,
    sessionData: {
      date: string;
      time: string;
      reason: string;
    },
    companyInfo: {
      name: string;
      email?: string;
      address?: string;
    },
  ): string {
    return this.renderStatusEmail({
      title: 'Cita cancelada',
      accent: '#dc2626',
      accentSoft: '#fef2f2',
      greeting: `Hola ${escapeHtml(clientName)},`,
      message:
        'Lamentamos informarte que tu cita programada fue cancelada. Estos son los detalles:',
      cardTitle: '❌ Cita cancelada',
      details: [
        { label: '📅 Fecha', value: sessionData.date },
        { label: '🕐 Hora', value: sessionData.time },
      ],
      note: {
        label: '📝 Motivo de cancelación',
        value: escapeHtml(sessionData.reason || 'No se especificó motivo.'),
      },
      closing: `Si deseas reagendar tu cita, puedes hacerlo desde la app o contactando directamente a <strong>${escapeHtml(companyInfo.name)}</strong>.`,
      companyInfo: {
        name: '',
        email: companyInfo.email,
        address: companyInfo.address,
      },
    });
  }

  private getSessionCancellationWorkerTemplate(
    workerName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
      reason: string;
    },
  ): string {
    return this.renderStatusEmail({
      title: 'Cita cancelada',
      accent: '#dc2626',
      accentSoft: '#fef2f2',
      greeting: `Hola ${escapeHtml(workerName)},`,
      message: 'Te informamos que una cita que tenías asignada fue cancelada.',
      cardTitle: '❌ Cita cancelada',
      details: [
        { label: '📅 Fecha', value: sessionData.date },
        { label: '🕐 Hora', value: sessionData.time },
        { label: '💼 Servicio', value: escapeHtml(sessionData.serviceName) },
        { label: '👤 Cliente', value: escapeHtml(sessionData.clientName) },
      ],
      note: {
        label: '📝 Motivo de cancelación',
        value: escapeHtml(sessionData.reason || 'No se especificó motivo.'),
      },
      closing: 'Tu agenda quedó libre para esa fecha y hora.',
    });
  }

  private getSessionAdminNotificationTemplate(
    adminName: string,
    sessionData: SessionEmailData,
    clientInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
    workers: Array<{
      name: string;
      email?: string;
      phone?: string;
    }>,
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): string {
    const accent = '#1d4ed8';
    const accentSoft = '#eff6ff';
    const services = sessionData.services ?? [];
    const single = services.length === 1 ? services[0] : null;
    const sub = (parts: string[]) => {
      const text = parts.filter(Boolean).join(' · ');
      return text
        ? `<div style="font-size:14px;font-weight:400;color:#64748b;margin:4px 0 0 0;">${text}</div>`
        : '';
    };
    const team = workers.length > 0 ? workers : [{ name: '' }];
    return this.renderEmail({
      title: 'Nueva cita agendada',
      accent,
      greeting: `Hola ${escapeHtml(adminName)},`,
      message: `Se registró una nueva cita en <strong>${escapeHtml(companyInfo.name || 'tu empresa')}</strong>. Esta es toda la información de la reserva:`,
      blocks: [
        this.emailCard({
          title: '📅 Detalles de la cita',
          accent,
          accentSoft,
          rows: [
            { label: '📅 Fecha', value: sessionData.date },
            { label: '🕐 Hora', value: sessionData.time },
            ...(single
              ? [
                  {
                    label: '💼 Servicio',
                    value: `${escapeHtml(single.name)}${sub([
                      `${single.duration} min`,
                      single.workerName ? escapeHtml(single.workerName) : '',
                    ])}`,
                  },
                ]
              : [
                  {
                    label: '💼 Servicios',
                    value: escapeHtml(this.servicesSummary(services)),
                  },
                ]),
            {
              label: single ? '💰 Costo' : '🧾 Total de la cita',
              value: `${this.totalCostDisplay(sessionData)} · ${sessionData.totalDuration} min`,
            },
          ],
          extra: this.renderServicesList(services, accent),
        }),
        this.emailCard({
          title: '👤 Cliente',
          accent,
          accentSoft,
          rows: [
            {
              label: 'Nombre',
              value: `${escapeHtml(clientInfo.name || '—')}${sub([
                clientInfo.phone ? `📞 ${escapeHtml(clientInfo.phone)}` : '',
                clientInfo.email ? `✉️ ${escapeHtml(clientInfo.email)}` : '',
              ])}`,
            },
          ],
        }),
        this.emailCard({
          title:
            team.length > 1
              ? '🧑‍💼 Trabajadores asignados'
              : '🧑‍💼 Trabajador asignado',
          accent,
          accentSoft,
          rows: team.map(
            (worker: { name: string; email?: string; phone?: string }) => ({
              label: 'Nombre',
              value: `${escapeHtml(worker.name || '—')}${sub([
                worker.phone ? `📞 ${escapeHtml(worker.phone)}` : '',
                worker.email ? `✉️ ${escapeHtml(worker.email)}` : '',
              ])}`,
            }),
          ),
        }),
        this.emailCard({
          title: '🏢 Empresa',
          accent,
          accentSoft,
          rows: [
            {
              label: 'Nombre',
              value: `${escapeHtml(companyInfo.name || '—')}${sub([
                companyInfo.address
                  ? `📍 ${escapeHtml(companyInfo.address)}`
                  : '',
                companyInfo.email ? `✉️ ${escapeHtml(companyInfo.email)}` : '',
              ])}`,
            },
          ],
        }),
      ],
      footerNote:
        'Este correo se envía automáticamente al administrador de la empresa. 📋 Notificación interna.',
    });
  }
}
