import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { BUSINESS_TIMEZONE } from '../common/utils/business-time.util';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
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

  async sendVerificationCode(
    email: string,
    code: string,
    username: string,
  ): Promise<boolean> {
    return this.sendCodeEmail(
      email,
      code,
      username,
      'Verifica tu cuenta',
      this.getVerificationEmailTemplate(username, code),
    );
  }

  async sendPasswordResetCode(
    email: string,
    code: string,
    username: string,
  ): Promise<boolean> {
    return this.sendCodeEmail(
      email,
      code,
      username,
      'Restablecer contraseña',
      this.getPasswordResetEmailTemplate(username, code),
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
  ): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error(
          'Resend no está inicializado. Verifica RESEND_API_KEY',
        );
        return false;
      }

      this.logger.log(
        `Enviando notificación de cambio de contraseña a ${email}`,
      );

      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Contraseña cambiada',
        html: this.getPasswordChangedEmailTemplate(username),
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
   * No incluye una hora local concreta a propósito: el backend guarda UTC y el
   * front localiza; el cliente ve el nuevo horario exacto en la app.
   */
  async sendSessionRescheduleToClient(
    clientEmail: string,
    clientName: string,
    companyName: string,
  ): Promise<boolean> {
    const nombre = (clientName || '').trim() || 'Hola';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
        <h2 style="color: #6b4eff;">Tu cita cambió de hora</h2>
        <p>${nombre},</p>
        <p>El horario de tu cita en <strong>${companyName}</strong> fue modificado.</p>
        <p>Abre la app para ver el nuevo horario de tu cita.</p>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          Este es un aviso automático, no respondas a este correo.
        </p>
      </div>
    `;
    return this.sendEmail(
      clientEmail,
      `Tu cita en ${companyName} cambió de hora`,
      html,
    );
  }

  async sendSessionConfirmationToClient(
    clientEmail: string,
    clientName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
    },
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
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
      clientPhone?: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
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
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
    },
    clientInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
    workerInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
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
      workerInfo,
      companyInfo,
    );

    return this.sendEmail(
      adminEmail,
      `📋 Nueva cita agendada - ${sessionData.date}`,
      html,
    );
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

  private getVerificationEmailTemplate(username: string, code: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Verifica tu cuenta - CLYPS</title>
          <style type="text/css">
              /* RESET */
              body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
              img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
              table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
              
              /* MOBILE STYLES */
              @media screen and (max-width: 630px) {
                  .container {
                      width: 94% !important;
                      margin: 0 auto !important;
                      padding: 10px !important;
                  }
                  .header {
                      padding: 25px 20px !important;
                      text-align: center !important;
                  }
                  .content {
                      padding: 25px 20px !important;
                  }
                  .logo {
                      font-size: 28px !important;
                      line-height: 32px !important;
                  }
                  .tagline {
                      font-size: 14px !important;
                      line-height: 18px !important;
                  }
                  .greeting {
                      font-size: 20px !important;
                      line-height: 24px !important;
                      margin-bottom: 15px !important;
                  }
                  .message {
                      font-size: 15px !important;
                      line-height: 22px !important;
                  }
                  .code-container {
                      padding: 20px !important;
                      margin: 25px 0 !important;
                  }
                  .code {
                      font-size: 32px !important;
                      letter-spacing: 6px !important;
                      padding: 18px 15px !important;
                      display: block !important;
                      word-break: break-all !important;
                  }
                  .code-label {
                      font-size: 12px !important;
                      margin-bottom: 12px !important;
                  }
                  .info-card {
                      padding: 15px !important;
                      margin: 20px 0 !important;
                      font-size: 14px !important;
                  }
                  .app-download-section {
                      padding: 20px !important;
                      margin: 20px 0 !important;
                  }
                  .app-buttons {
                      flex-direction: column !important;
                      gap: 10px !important;
                  }
                  .app-btn {
                      padding: 10px 15px !important;
                      font-size: 13px !important;
                  }
                  .footer {
                      padding: 20px !important;
                  }
                  .footer p {
                      font-size: 12px !important;
                      line-height: 16px !important;
                  }
                  .divider {
                      margin: 20px 0 !important;
                  }
              }
              
              /* DESKTOP STYLES */
              body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  background-color: #f8fafc !important;
                  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                  line-height: 1.6 !important;
                  color: #334155 !important;
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
              }
              .container {
                  max-width: 580px !important;
                  width: 100% !important;
                  margin: 30px auto !important;
                  background-color: #ffffff !important;
                  border-radius: 12px !important;
                  overflow: hidden !important;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                  border: 1px solid #e2e8f0 !important;
              }
              .header {
                  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
                  color: #ffffff !important;
                  padding: 35px 40px !important;
                  text-align: center !important;
                  position: relative !important;
              }
              .header:before {
                  content: '' !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  height: 4px !important;
                  background: linear-gradient(90deg, #3b82f6, #8b5cf6) !important;
              }
              .logo {
                  font-size: 36px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.5px !important;
                  margin: 0 0 8px 0 !important;
                  font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                  line-height: 1.2 !important;
              }
              .tagline {
                  font-size: 15px !important;
                  font-weight: 300 !important;
                  opacity: 0.9 !important;
                  margin: 0 !important;
                  line-height: 1.4 !important;
              }
              .content {
                  padding: 40px !important;
              }
              .greeting {
                  font-size: 22px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 0 20px 0 !important;
                  border-bottom: 2px solid #f1f5f9 !important;
                  padding-bottom: 15px !important;
                  line-height: 1.3 !important;
              }
              .message {
                  color: #475569 !important;
                  margin: 0 0 30px 0 !important;
                  font-size: 15.5px !important;
                  line-height: 1.7 !important;
              }
              .code-container {
                  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  margin: 35px 0 !important;
                  text-align: center !important;
                  border: 1px solid #e2e8f0 !important;
                  position: relative !important;
              }
              .code-label {
                  font-size: 13px !important;
                  color: #64748b !important;
                  margin-bottom: 15px !important;
                  text-transform: uppercase !important;
                  letter-spacing: 1px !important;
                  font-weight: 600 !important;
                  line-height: 1.2 !important;
              }
              .code {
                  display: inline-block !important;
                  font-size: 40px !important;
                  font-weight: 700 !important;
                  color: #4f46e5 !important;
                  background-color: #ffffff !important;
                  padding: 25px 35px !important;
                  border-radius: 8px !important;
                  letter-spacing: 8px !important;
                  font-family: 'Courier New', monospace !important;
                  border: 2px solid #c7d2fe !important;
                  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1) !important;
                  line-height: 1 !important;
                  word-wrap: break-word !important;
              }
              .info-card {
                  background-color: #fff7ed !important;
                  border-left: 4px solid #f59e0b !important;
                  padding: 18px !important;
                  margin: 25px 0 !important;
                  border-radius: 8px !important;
                  font-size: 14.5px !important;
                  color: #92400e !important;
                  display: flex !important;
                  align-items: center !important;
              }
              .info-icon {
                  margin-right: 12px !important;
                  font-size: 16px !important;
              }
              .app-download-section {
                  background-color: #f0f9ff !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  margin: 35px 0 !important;
                  text-align: center !important;
                  border: 2px solid #bae6fd !important;
              }
              .app-title {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #0369a1 !important;
                  margin: 0 0 15px 0 !important;
              }
              .app-buttons {
                  display: flex !important;
                  justify-content: center !important;
                  gap: 15px !important;
                  flex-wrap: wrap !important;
                  margin-bottom: 20px !important;
              }
              .app-btn {
                  display: inline-block !important;
                  padding: 12px 25px !important;
                  text-decoration: none !important;
                  border-radius: 8px !important;
                  font-weight: 600 !important;
                  font-size: 14px !important;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
                  transition: transform 0.2s, box-shadow 0.2s !important;
              }
              .app-btn:hover {
                  transform: translateY(-2px) !important;
                  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15) !important;
              }
              .android-btn {
                  background-color: #34d399 !important;
                  color: white !important;
              }
              .ios-btn {
                  background-color: #000000 !important;
                  color: white !important;
              }
              .web-link {
                  color: #4f46e5 !important;
                  font-weight: 600 !important;
                  text-decoration: none !important;
              }
              .footer {
                  background-color: #f8fafc !important;
                  padding: 25px 40px !important;
                  text-align: center !important;
                  border-top: 1px solid #e2e8f0 !important;
                  color: #64748b !important;
                  font-size: 13px !important;
              }
              .footer p {
                  margin: 5px 0 !important;
                  line-height: 1.5 !important;
              }
              .divider {
                  height: 1px !important;
                  background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                  margin: 30px 0 !important;
              }
              .security-note {
                  text-align: center !important;
                  font-size: 13px !important;
                  color: #94a3b8 !important;
                  padding: 10px !important;
                  font-style: italic !important;
                  line-height: 1.5 !important;
              }
              /* FALLBACK FOR OUTLOOK */
              .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                  line-height: 100% !important;
              }
              /* IOS FIX */
              a[x-apple-data-detectors] {
                  color: inherit !important;
                  text-decoration: none !important;
                  font-size: inherit !important;
                  font-family: inherit !important;
                  font-weight: inherit !important;
                  line-height: inherit !important;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <!--[if (gte mso 9)|(IE)]>
          <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
          <td>
          <![endif]-->
          
          <div class="container" style="max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              <div class="header" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 35px 40px; text-align: center; position: relative;">
                  <h1 class="logo" style="font-size: 36px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                  <p class="tagline" style="font-size: 15px; font-weight: 300; opacity: 0.9; margin: 0;">Gestión Profesional de Citas</p>
              </div>
              
              <div class="content" style="padding: 40px;">
                  <h2 class="greeting" style="font-size: 22px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">Estimado/a ${username},</h2>
                  
                  <p class="message" style="color: #475569; margin: 0 0 30px 0; font-size: 15.5px; line-height: 1.7;">
                      Le damos la bienvenida a CLYPS. Para completar su registro y comenzar a utilizar 
                      todas las funcionalidades de nuestro sistema, por favor verifique su cuenta 
                      utilizando el siguiente código:
                  </p>
                  
                  <div class="code-container" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 1px solid #e2e8f0;">
                      <div class="code-label" style="font-size: 13px; color: #64748b; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Código de Verificación</div>
                      <div class="code" style="display: inline-block; font-size: 40px; font-weight: 700; color: #4f46e5; background-color: #ffffff; padding: 25px 35px; border-radius: 8px; letter-spacing: 8px; font-family: 'Courier New', monospace; border: 2px solid #c7d2fe; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1);">${code}</div>
                  </div>
                  
                  <div class="info-card" style="background-color: #fff7ed; border-left: 4px solid #f59e0b; padding: 18px; margin: 25px 0; border-radius: 8px; font-size: 14.5px; color: #92400e; display: flex; align-items: center;">
                      <span class="info-icon" style="margin-right: 12px; font-size: 16px;">⏰</span>
                      <span>Este código tiene una validez de 15 minutos.</span>
                  </div>
                  
                  <!-- SECCIÓN DE DESCARGA DE APP -->
                  <div class="app-download-section" style="background-color: #f0f9ff; border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #bae6fd;">
                      <h3 class="app-title" style="font-size: 18px; font-weight: 600; color: #0369a1; margin: 0 0 15px 0;">
                          📱 ¡Descarga nuestra App Móvil!
                      </h3>
                      <p style="color: #475569; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                          Para una mejor experiencia, gestiona tus citas desde tu dispositivo móvil. 
                          Descarga la app de CLYPS disponible en:
                      </p>
                      <div class="app-buttons" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
                          <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                             class="app-btn android-btn" 
                             style="display: inline-block; background-color: #34d399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(52, 211, 153, 0.3);">
                              🟢 Google Play
                          </a>
                          <a href="https://apps.apple.com/app/id1645438827" 
                             class="app-btn ios-btn" 
                             style="display: inline-block; background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
                              ⚫ App Store
                          </a>
                      </div>
                      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.5;">
                          También puedes acceder desde: 
                          <a href="https://app.clyps.com" class="web-link" style="color: #4f46e5; font-weight: 600; text-decoration: none;">
                              app.clyps.com
                          </a>
                      </p>
                  </div>
                  <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                  
                  <div class="divider" style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 30px 0;"></div>
                  
                  <p class="security-note" style="text-align: center; font-size: 13px; color: #94a3b8; padding: 10px; font-style: italic;">
                      Si no ha solicitado este código, puede ignorar este mensaje de manera segura.
                  </p>
              </div>
              
              <div class="footer" style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                  <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                  <p style="margin: 5px 0;">Sistema de Gestión de Citas Profesional</p>
                  <p style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
                      Este es un mensaje automático, por favor no responder a este correo.
                  </p>
              </div>
          </div>
          
          <!--[if (gte mso 9)|(IE)]>
          </td>
          </tr>
          </table>
          <![endif]-->
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(
    username: string,
    code: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Restablecer Contraseña - CLYPS</title>
          <style type="text/css">
              /* RESET */
              body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
              img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
              table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
              
              /* MOBILE STYLES */
              @media screen and (max-width: 630px) {
                  .container {
                      width: 94% !important;
                      margin: 0 auto !important;
                      padding: 10px !important;
                  }
                  .header {
                      padding: 25px 20px !important;
                      text-align: center !important;
                  }
                  .content {
                      padding: 25px 20px !important;
                  }
                  .logo {
                      font-size: 28px !important;
                      line-height: 32px !important;
                  }
                  .tagline {
                      font-size: 14px !important;
                      line-height: 18px !important;
                  }
                  .greeting {
                      font-size: 20px !important;
                      line-height: 24px !important;
                      margin-bottom: 15px !important;
                  }
                  .message {
                      font-size: 15px !important;
                      line-height: 22px !important;
                  }
                  .code-container {
                      padding: 20px !important;
                      margin: 25px 0 !important;
                  }
                  .code {
                      font-size: 32px !important;
                      letter-spacing: 6px !important;
                      padding: 18px 15px !important;
                      display: block !important;
                      word-break: break-all !important;
                  }
                  .code-label {
                      font-size: 12px !important;
                      margin-bottom: 12px !important;
                  }
                  .security-card, .step, .steps-container {
                      padding: 15px !important;
                      margin: 15px 0 !important;
                  }
                  .steps-container {
                      grid-template-columns: 1fr !important;
                      gap: 15px !important;
                  }
                  .step {
                      padding: 18px !important;
                  }
                  .app-download-section {
                      padding: 20px !important;
                      margin: 20px 0 !important;
                  }
                  .app-buttons {
                      flex-direction: column !important;
                      gap: 10px !important;
                  }
                  .app-btn {
                      padding: 10px 15px !important;
                      font-size: 13px !important;
                  }
                  .footer {
                      padding: 20px !important;
                  }
                  .footer p {
                      font-size: 12px !important;
                      line-height: 16px !important;
                  }
                  .divider {
                      margin: 20px 0 !important;
                  }
              }
              
              /* TABLET STYLES */
              @media screen and (min-width: 631px) and (max-width: 769px) {
                  .container {
                      width: 90% !important;
                  }
                  .steps-container {
                      grid-template-columns: 1fr 1fr !important;
                      gap: 20px !important;
                  }
              }
              
              /* DESKTOP STYLES */
              body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  background-color: #f8fafc !important;
                  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                  line-height: 1.6 !important;
                  color: #334155 !important;
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
              }
              .container {
                  max-width: 580px !important;
                  width: 100% !important;
                  margin: 30px auto !important;
                  background-color: #ffffff !important;
                  border-radius: 12px !important;
                  overflow: hidden !important;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                  border: 1px solid #e2e8f0 !important;
              }
              .header {
                  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%) !important;
                  color: #ffffff !important;
                  padding: 35px 40px !important;
                  text-align: center !important;
                  position: relative !important;
              }
              .header:before {
                  content: '' !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  height: 4px !important;
                  background: linear-gradient(90deg, #b91c1c, #f87171) !important;
              }
              .logo {
                  font-size: 36px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.5px !important;
                  margin: 0 0 8px 0 !important;
                  font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                  line-height: 1.2 !important;
              }
              .tagline {
                  font-size: 15px !important;
                  font-weight: 300 !important;
                  opacity: 0.9 !important;
                  margin: 0 !important;
                  line-height: 1.4 !important;
              }
              .content {
                  padding: 40px !important;
              }
              .greeting {
                  font-size: 22px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 0 20px 0 !important;
                  border-bottom: 2px solid #f1f5f9 !important;
                  padding-bottom: 15px !important;
                  line-height: 1.3 !important;
              }
              .message {
                  color: #475569 !important;
                  margin: 0 0 30px 0 !important;
                  font-size: 15.5px !important;
                  line-height: 1.7 !important;
              }
              .code-container {
                  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%) !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  margin: 35px 0 !important;
                  text-align: center !important;
                  border: 1px solid #fecaca !important;
                  position: relative !important;
              }
              .code-label {
                  font-size: 13px !important;
                  color: #b91c1c !important;
                  margin-bottom: 15px !important;
                  text-transform: uppercase !important;
                  letter-spacing: 1px !important;
                  font-weight: 600 !important;
                  line-height: 1.2 !important;
              }
              .code {
                  display: inline-block !important;
                  font-size: 40px !important;
                  font-weight: 700 !important;
                  color: #dc2626 !important;
                  background-color: #ffffff !important;
                  padding: 25px 35px !important;
                  border-radius: 8px !important;
                  letter-spacing: 8px !important;
                  font-family: 'Courier New', monospace !important;
                  border: 2px solid #fca5a5 !important;
                  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1) !important;
                  line-height: 1 !important;
                  word-wrap: break-word !important;
              }
              .security-card {
                  background-color: #fffbeb !important;
                  border-radius: 10px !important;
                  padding: 25px !important;
                  margin: 30px 0 !important;
                  border: 1px solid #fde68a !important;
              }
              .security-title {
                  font-size: 16px !important;
                  font-weight: 600 !important;
                  color: #92400e !important;
                  margin: 0 0 15px 0 !important;
                  display: flex !important;
                  align-items: center !important;
              }
              .security-icon {
                  margin-right: 10px !important;
                  font-size: 18px !important;
              }
              .security-text {
                  font-size: 14.5px !important;
                  color: #78350f !important;
                  line-height: 1.6 !important;
                  margin: 0 !important;
              }
              .steps-container {
                  display: grid !important;
                  grid-template-columns: 1fr 1fr !important;
                  gap: 20px !important;
                  margin: 30px 0 !important;
              }
              .step {
                  background-color: #f8fafc !important;
                  border-radius: 8px !important;
                  padding: 20px !important;
                  border: 1px solid #e2e8f0 !important;
              }
              .step-number {
                  display: inline-block !important;
                  background-color: #dc2626 !important;
                  color: white !important;
                  width: 28px !important;
                  height: 28px !important;
                  border-radius: 50% !important;
                  text-align: center !important;
                  line-height: 28px !important;
                  font-weight: 600 !important;
                  font-size: 14px !important;
                  margin-bottom: 15px !important;
              }
              .step-title {
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 0 8px 0 !important;
                  font-size: 15px !important;
                  line-height: 1.3 !important;
              }
              .step-description {
                  color: #64748b !important;
                  font-size: 14px !important;
                  line-height: 1.5 !important;
                  margin: 0 !important;
              }
              .app-download-section {
                  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%) !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  margin: 35px 0 !important;
                  text-align: center !important;
                  border: 2px solid #7dd3fc !important;
              }
              .app-title {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #0369a1 !important;
                  margin: 0 0 15px 0 !important;
              }
              .app-buttons {
                  display: flex !important;
                  justify-content: center !important;
                  gap: 15px !important;
                  flex-wrap: wrap !important;
                  margin-bottom: 20px !important;
              }
              .app-btn {
                  display: inline-block !important;
                  padding: 12px 25px !important;
                  text-decoration: none !important;
                  border-radius: 8px !important;
                  font-weight: 600 !important;
                  font-size: 14px !important;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
                  transition: transform 0.2s, box-shadow 0.2s !important;
              }
              .app-btn:hover {
                  transform: translateY(-2px) !important;
                  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15) !important;
              }
              .android-btn {
                  background-color: #34d399 !important;
                  color: white !important;
              }
              .ios-btn {
                  background-color: #000000 !important;
                  color: white !important;
              }
              .web-link {
                  color: #0369a1 !important;
                  font-weight: 600 !important;
                  text-decoration: none !important;
              }
              .footer {
                  background-color: #f8fafc !important;
                  padding: 25px 40px !important;
                  text-align: center !important;
                  border-top: 1px solid #e2e8f0 !important;
                  color: #64748b !important;
                  font-size: 13px !important;
              }
              .footer p {
                  margin: 5px 0 !important;
                  line-height: 1.5 !important;
              }
              .divider {
                  height: 1px !important;
                  background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                  margin: 30px 0 !important;
              }
              /* FALLBACK FOR OUTLOOK */
              .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                  line-height: 100% !important;
              }
              /* IOS FIX */
              a[x-apple-data-detectors] {
                  color: inherit !important;
                  text-decoration: none !important;
                  font-size: inherit !important;
                  font-family: inherit !important;
                  font-weight: inherit !important;
                  line-height: inherit !important;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <!--[if (gte mso 9)|(IE)]>
          <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
          <td>
          <![endif]-->
          
          <div class="container" style="max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: #ffffff; padding: 35px 40px; text-align: center; position: relative;">
                  <h1 class="logo" style="font-size: 36px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                  <p class="tagline" style="font-size: 15px; font-weight: 300; opacity: 0.9; margin: 0;">Restablecimiento de Contraseña</p>
              </div>
              
              <div class="content" style="padding: 40px;">
                  <h2 class="greeting" style="font-size: 22px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">Estimado/a ${username},</h2>
                  
                  <p class="message" style="color: #475569; margin: 0 0 30px 0; font-size: 15.5px; line-height: 1.7;">
                      Hemos recibido una solicitud para restablecer la contraseña de su cuenta CLYPS. 
                      Para continuar con el proceso, utilice el siguiente código de verificación:
                  </p>
                  
                  <div class="code-container" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 1px solid #fecaca;">
                      <div class="code-label" style="font-size: 13px; color: #b91c1c; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Código de Restablecimiento</div>
                      <div class="code" style="display: inline-block; font-size: 40px; font-weight: 700; color: #dc2626; background-color: #ffffff; padding: 25px 35px; border-radius: 8px; letter-spacing: 8px; font-family: 'Courier New', monospace; border: 2px solid #fca5a5; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);">${code}</div>
                  </div>
                  
                  <div class="security-card" style="background-color: #fffbeb; border-radius: 10px; padding: 25px; margin: 30px 0; border: 1px solid #fde68a;">
                      <h3 class="security-title" style="font-size: 16px; font-weight: 600; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                          <span class="security-icon" style="margin-right: 10px; font-size: 18px;">⚠️</span>
                          Medidas de Seguridad
                      </h3>
                      <p class="security-text" style="font-size: 14.5px; color: #78350f; line-height: 1.6; margin: 0;">
                          Este código es personal e intransferible. Por favor, no lo comparta con nadie. 
                          Si no ha solicitado este cambio, ignore este mensaje y verifique la seguridad de su cuenta.
                      </p>
                  </div>
                  
                  <!-- SECCIÓN DE DESCARGA DE APP -->
                  <div class="app-download-section" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #7dd3fc;">
                      <h3 class="app-title" style="font-size: 18px; font-weight: 600; color: #0369a1; margin: 0 0 15px 0;">
                          📱 ¿Sabías que tenemos app móvil?
                      </h3>
                      <p style="color: #475569; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                          Restablece tu contraseña más fácilmente desde nuestra app. 
                          Descárgala y gestiona tu cuenta desde cualquier lugar:
                      </p>
                      <div class="app-buttons" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
                          <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                             class="app-btn android-btn" 
                             style="display: inline-block; background-color: #34d399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              🟢 Google Play
                          </a>
                          <a href="https://apps.apple.com/app/id1645438827" 
                             class="app-btn ios-btn" 
                             style="display: inline-block; background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              ⚫ App Store
                          </a>
                      </div>
                      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.5;">
                          También puedes acceder desde: 
                          <a href="https://app.clyps.com" class="web-link" style="color: #0369a1; font-weight: 600; text-decoration: none;">
                              app.clyps.com
                          </a>
                      </p>
                  </div>
                  <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                  
                  <p class="message" style="text-align: center; color: #dc2626; font-weight: 500; margin: 20px 0;">
                      ⏰ Este código expira en 15 minutos.
                  </p>
                  
                  <div class="divider" style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 30px 0;"></div>
                  
                  <p style="text-align: center; color: #64748b; font-size: 14px; line-height: 1.6;">
                      Si necesita asistencia, nuestro equipo de soporte está disponible para ayudarle.
                  </p>
              </div>
              
              <div class="footer" style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                  <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                  <p style="margin: 5px 0;">Protegiendo su acceso y datos personales</p>
                  <p style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
                      Este es un mensaje automático de seguridad.
                  </p>
              </div>
          </div>
          
          <!--[if (gte mso 9)|(IE)]>
          </td>
          </tr>
          </table>
          <![endif]-->
      </body>
      </html>
    `;
  }

  private getPasswordChangedEmailTemplate(username: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Contraseña Actualizada - CLYPS</title>
          <style type="text/css">
              /* RESET */
              body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
              img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
              table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
              
              /* MOBILE STYLES */
              @media screen and (max-width: 630px) {
                  .container {
                      width: 94% !important;
                      margin: 0 auto !important;
                      padding: 10px !important;
                  }
                  .header {
                      padding: 25px 20px !important;
                      text-align: center !important;
                  }
                  .content {
                      padding: 25px 20px !important;
                  }
                  .logo {
                      font-size: 28px !important;
                      line-height: 32px !important;
                  }
                  .tagline {
                      font-size: 14px !important;
                      line-height: 18px !important;
                  }
                  .greeting {
                      font-size: 20px !important;
                      line-height: 24px !important;
                      margin-bottom: 15px !important;
                  }
                  .success-card {
                      padding: 25px 20px !important;
                      margin: 20px 0 !important;
                  }
                  .success-icon {
                      font-size: 36px !important;
                      margin-bottom: 15px !important;
                  }
                  .success-title {
                      font-size: 20px !important;
                      line-height: 24px !important;
                  }
                  .success-message {
                      font-size: 15px !important;
                      line-height: 20px !important;
                  }
                  .details-card, .timestamp, .security-alert {
                      padding: 18px !important;
                      margin: 15px 0 !important;
                  }
                  .app-download-section {
                      padding: 20px !important;
                      margin: 20px 0 !important;
                  }
                  .app-buttons {
                      flex-direction: column !important;
                      gap: 10px !important;
                  }
                  .app-btn {
                      padding: 10px 15px !important;
                      font-size: 13px !important;
                  }
                  .footer {
                      padding: 20px !important;
                  }
                  .footer p {
                      font-size: 12px !important;
                      line-height: 16px !important;
                  }
                  .divider {
                      margin: 20px 0 !important;
                  }
              }
              
              /* DESKTOP STYLES */
              body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  background-color: #f8fafc !important;
                  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                  line-height: 1.6 !important;
                  color: #334155 !important;
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
              }
              .container {
                  max-width: 580px !important;
                  width: 100% !important;
                  margin: 30px auto !important;
                  background-color: #ffffff !important;
                  border-radius: 12px !important;
                  overflow: hidden !important;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                  border: 1px solid #e2e8f0 !important;
              }
              .header {
                  background: linear-gradient(135deg, #059669 0%, #10b981 100%) !important;
                  color: #ffffff !important;
                  padding: 35px 40px !important;
                  text-align: center !important;
                  position: relative !important;
              }
              .header:before {
                  content: '' !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  height: 4px !important;
                  background: linear-gradient(90deg, #047857, #34d399) !important;
              }
              .logo {
                  font-size: 36px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.5px !important;
                  margin: 0 0 8px 0 !important;
                  font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                  line-height: 1.2 !important;
              }
              .tagline {
                  font-size: 15px !important;
                  font-weight: 300 !important;
                  opacity: 0.9 !important;
                  margin: 0 !important;
                  line-height: 1.4 !important;
              }
              .content {
                  padding: 40px !important;
              }
              .greeting {
                  font-size: 22px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 0 25px 0 !important;
                  line-height: 1.3 !important;
              }
              .success-card {
                  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%) !important;
                  border-radius: 10px !important;
                  padding: 35px !important;
                  margin: 30px 0 !important;
                  text-align: center !important;
                  border: 1px solid #a7f3d0 !important;
              }
              .success-icon {
                  font-size: 48px !important;
                  margin-bottom: 20px !important;
                  color: #059669 !important;
                  line-height: 1 !important;
              }
              .success-title {
                  font-size: 24px !important;
                  font-weight: 600 !important;
                  color: #065f46 !important;
                  margin: 0 0 10px 0 !important;
                  line-height: 1.2 !important;
              }
              .success-message {
                  font-size: 16px !important;
                  color: #047857 !important;
                  margin: 0 !important;
                  line-height: 1.5 !important;
              }
              .details-card {
                  background-color: #f0fdf4 !important;
                  border-radius: 10px !important;
                  padding: 25px !important;
                  margin: 25px 0 !important;
                  border: 1px solid #bbf7d0 !important;
              }
              .details-title {
                  font-size: 16px !important;
                  font-weight: 600 !important;
                  color: #065f46 !important;
                  margin: 0 0 15px 0 !important;
                  display: flex !important;
                  align-items: center !important;
              }
              .details-icon {
                  margin-right: 10px !important;
                  font-size: 18px !important;
              }
              .details-list {
                  list-style: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
              }
              .details-list li {
                  padding: 8px 0 !important;
                  color: #047857 !important;
                  font-size: 14.5px !important;
                  border-bottom: 1px solid #dcfce7 !important;
                  line-height: 1.5 !important;
              }
              .details-list li:last-child {
                  border-bottom: none !important;
              }
              .timestamp {
                  background-color: #f8fafc !important;
                  border-radius: 8px !important;
                  padding: 18px !important;
                  text-align: center !important;
                  margin: 25px 0 !important;
                  font-size: 14.5px !important;
                  color: #475569 !important;
                  border: 1px solid #e2e8f0 !important;
                  line-height: 1.5 !important;
              }
              .security-alert {
                  background-color: #fef3c7 !important;
                  border-radius: 10px !important;
                  padding: 22px !important;
                  margin: 30px 0 !important;
                  border: 1px solid #fcd34d !important;
              }
              .alert-title {
                  font-size: 16px !important;
                  font-weight: 600 !important;
                  color: #92400e !important;
                  margin: 0 0 12px 0 !important;
                  display: flex !important;
                  align-items: center !important;
              }
              .alert-icon {
                  margin-right: 10px !important;
                  font-size: 18px !important;
              }
              .alert-text {
                  font-size: 14.5px !important;
                  color: #78350f !important;
                  line-height: 1.6 !important;
                  margin: 0 !important;
              }
              .app-download-section {
                  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  margin: 35px 0 !important;
                  text-align: center !important;
                  border: 2px solid #7dd3fc !important;
              }
              .app-title {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #0369a1 !important;
                  margin: 0 0 15px 0 !important;
              }
              .app-buttons {
                  display: flex !important;
                  justify-content: center !important;
                  gap: 15px !important;
                  flex-wrap: wrap !important;
                  margin-bottom: 20px !important;
              }
              .app-btn {
                  display: inline-block !important;
                  padding: 12px 25px !important;
                  text-decoration: none !important;
                  border-radius: 8px !important;
                  font-weight: 600 !important;
                  font-size: 14px !important;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
                  transition: transform 0.2s, box-shadow 0.2s !important;
              }
              .app-btn:hover {
                  transform: translateY(-2px) !important;
                  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15) !important;
              }
              .android-btn {
                  background-color: #34d399 !important;
                  color: white !important;
              }
              .ios-btn {
                  background-color: #000000 !important;
                  color: white !important;
              }
              .web-link {
                  color: #0369a1 !important;
                  font-weight: 600 !important;
                  text-decoration: none !important;
              }
              .footer {
                  background-color: #f8fafc !important;
                  padding: 25px 40px !important;
                  text-align: center !important;
                  border-top: 1px solid #e2e8f0 !important;
                  color: #64748b !important;
                  font-size: 13px !important;
              }
              .footer p {
                  margin: 5px 0 !important;
                  line-height: 1.5 !important;
              }
              .divider {
                  height: 1px !important;
                  background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                  margin: 30px 0 !important;
              }
              /* FALLBACK FOR OUTLOOK */
              .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                  line-height: 100% !important;
              }
              /* IOS FIX */
              a[x-apple-data-detectors] {
                  color: inherit !important;
                  text-decoration: none !important;
                  font-size: inherit !important;
                  font-family: inherit !important;
                  font-weight: inherit !important;
                  line-height: inherit !important;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <!--[if (gte mso 9)|(IE)]>
          <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
          <td>
          <![endif]-->
          
          <div class="container" style="max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              <div class="header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; padding: 35px 40px; text-align: center; position: relative;">
                  <h1 class="logo" style="font-size: 36px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                  <p class="tagline" style="font-size: 15px; font-weight: 300; opacity: 0.9; margin: 0;">Notificación de Seguridad</p>
              </div>
              
              <div class="content" style="padding: 40px;">
                  <h2 class="greeting" style="font-size: 22px; font-weight: 600; color: #1e293b; margin: 0 0 25px 0;">Estimado/a ${username},</h2>
                  
                  <div class="success-card" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius: 10px; padding: 35px; margin: 30px 0; text-align: center; border: 1px solid #a7f3d0;">
                      <div class="success-icon" style="font-size: 48px; margin-bottom: 20px; color: #059669;">✓</div>
                      <h3 class="success-title" style="font-size: 24px; font-weight: 600; color: #065f46; margin: 0 0 10px 0;">Contraseña Actualizada Correctamente</h3>
                      <p class="success-message" style="font-size: 16px; color: #047857; margin: 0; line-height: 1.5;">
                          Su contraseña ha sido modificada exitosamente en el sistema CLYPS.
                      </p>
                  </div>
                  
                  <div class="details-card" style="background-color: #f0fdf4; border-radius: 10px; padding: 25px; margin: 25px 0; border: 1px solid #bbf7d0;">
                      <h3 class="details-title" style="font-size: 16px; font-weight: 600; color: #065f46; margin: 0 0 15px 0; display: flex; align-items: center;">
                          <span class="details-icon" style="margin-right: 10px; font-size: 18px;">📋</span>
                          Detalles del Cambio
                      </h3>
                      <ul class="details-list" style="list-style: none; padding: 0; margin: 0;">
                          <li style="padding: 8px 0; color: #047857; font-size: 14.5px; border-bottom: 1px solid #dcfce7; line-height: 1.5;">✓ Cambio de contraseña confirmado</li>
                          <li style="padding: 8px 0; color: #047857; font-size: 14.5px; border-bottom: 1px solid #dcfce7; line-height: 1.5;">✓ Acceso seguro establecido</li>
                          <li style="padding: 8px 0; color: #047857; font-size: 14.5px; line-height: 1.5;">✓ Credenciales actualizadas en el sistema</li>
                      </ul>
                  </div>
                  
                  <div class="timestamp" style="background-color: #f8fafc; border-radius: 8px; padding: 18px; text-align: center; margin: 25px 0; font-size: 14.5px; color: #475569; border: 1px solid #e2e8f0; line-height: 1.5;">
                      <strong>Fecha y Hora del Cambio:</strong><br>
                      ${new Date().toLocaleString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: BUSINESS_TIMEZONE,
                      })}
                  </div>
                  
                  <!-- SECCIÓN DE DESCARGA DE APP -->
                  <div class="app-download-section" style="background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #7dd3fc;">
                      <h3 class="app-title" style="font-size: 18px; font-weight: 600; color: #0369a1; margin: 0 0 15px 0;">
                          📱 ¡Accede a tu cuenta desde cualquier lugar!
                      </h3>
                      <p style="color: #475569; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                          Con nuestra app móvil, puedes gestionar tu cuenta y citas desde tu teléfono. 
                          ¡Descárgala ahora!
                      </p>
                      <div class="app-buttons" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
                          <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                             class="app-btn android-btn" 
                             style="display: inline-block; background-color: #34d399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              🟢 Google Play
                          </a>
                          <a href="https://apps.apple.com/app/id1645438827" 
                             class="app-btn ios-btn" 
                             style="display: inline-block; background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              ⚫ App Store
                          </a>
                      </div>
                      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.5;">
                          Acceso web: 
                          <a href="https://app.clyps.com" class="web-link" style="color: #0369a1; font-weight: 600; text-decoration: none;">
                              app.clyps.com
                          </a>
                      </p>
                  </div>
                  <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                  
                  <div class="security-alert" style="background-color: #fef3c7; border-radius: 10px; padding: 22px; margin: 30px 0; border: 1px solid #fcd34d;">
                      <h3 class="alert-title" style="font-size: 16px; font-weight: 600; color: #92400e; margin: 0 0 12px 0; display: flex; align-items: center;">
                          <span class="alert-icon" style="margin-right: 10px; font-size: 18px;">⚠️</span>
                          Importante: Verificación de Seguridad
                      </h3>
                      <p class="alert-text" style="font-size: 14.5px; color: #78350f; line-height: 1.6; margin: 0;">
                          Si no realizó este cambio, por favor contacte inmediatamente con nuestro 
                          equipo de soporte para asegurar su cuenta.
                      </p>
                  </div>
                  
                  <div class="divider" style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 30px 0;"></div>
                  
                  <p style="text-align: center; color: #64748b; font-size: 14px; line-height: 1.6;">
                      Esta es una notificación automática para mantenerle informado sobre los cambios en su cuenta.
                  </p>
              </div>
              
              <div class="footer" style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                  <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                  <p style="margin: 5px 0;">Su seguridad es nuestra máxima prioridad</p>
                  <p style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
                      Sistema de Gestión de Citas Profesional
                  </p>
              </div>
          </div>
          
          <!--[if (gte mso 9)|(IE)]>
          </td>
          </tr>
          </table>
          <![endif]-->
      </body>
      </html>
    `;
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
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Bienvenido a CLYPS - Credenciales de Acceso</title>
          <style type="text/css">
              /* RESET */
              body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
              img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
              table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
              
              /* MOBILE STYLES */
              @media screen and (max-width: 630px) {
                  .container {
                      width: 94% !important;
                      margin: 0 auto !important;
                      padding: 10px !important;
                  }
                  .header {
                      padding: 25px 20px !important;
                      text-align: center !important;
                  }
                  .content {
                      padding: 0 !important;
                  }
                  .logo {
                      font-size: 32px !important;
                      line-height: 36px !important;
                  }
                  .welcome-title {
                      font-size: 24px !important;
                      line-height: 28px !important;
                  }
                  .welcome-subtitle {
                      font-size: 14px !important;
                      line-height: 18px !important;
                  }
                  .company-info {
                      padding: 20px !important;
                      margin: 15px 0 !important;
                  }
                  .company-name {
                      font-size: 20px !important;
                      line-height: 24px !important;
                  }
                  .welcome-section, .credentials-section, .steps-section, .security-section, .support-section {
                      padding: 25px 20px !important;
                  }
                  .greeting {
                      font-size: 22px !important;
                      line-height: 26px !important;
                      margin-bottom: 15px !important;
                  }
                  .welcome-message {
                      font-size: 15px !important;
                      line-height: 22px !important;
                  }
                  .credentials-grid {
                      grid-template-columns: 1fr !important;
                      gap: 15px !important;
                  }
                  .credential-card {
                      padding: 20px !important;
                  }
                  .credential-value {
                      font-size: 16px !important;
                      line-height: 20px !important;
                  }
                  .steps-grid {
                      grid-template-columns: 1fr !important;
                      gap: 15px !important;
                  }
                  .step-card {
                      padding: 20px !important;
                  }
                  .step-header {
                      margin-bottom: 12px !important;
                  }
                  .step-name {
                      font-size: 16px !important;
                      line-height: 20px !important;
                  }
                  .steps-title {
                      font-size: 20px !important;
                      line-height: 24px !important;
                      margin-bottom: 25px !important;
                  }
                  .app-download-section {
                      padding: 20px !important;
                      margin: 20px 0 !important;
                  }
                  .app-buttons {
                      flex-direction: column !important;
                      gap: 10px !important;
                  }
                  .app-btn {
                      padding: 10px 15px !important;
                      font-size: 13px !important;
                  }
                  .footer {
                      padding: 25px 20px !important;
                  }
                  .footer-logo {
                      font-size: 20px !important;
                      line-height: 24px !important;
                  }
              }
              
              /* TABLET STYLES */
              @media screen and (min-width: 631px) and (max-width: 769px) {
                  .container {
                      width: 90% !important;
                  }
                  .credentials-grid, .steps-grid {
                      grid-template-columns: 1fr 1fr !important;
                  }
              }
              
              /* DESKTOP STYLES */
              body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  background-color: #f8fafc !important;
                  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                  line-height: 1.6 !important;
                  color: #334155 !important;
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
              }
              .container {
                  max-width: 620px !important;
                  width: 100% !important;
                  margin: 30px auto !important;
                  background-color: #ffffff !important;
                  border-radius: 12px !important;
                  overflow: hidden !important;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                  border: 1px solid #e2e8f0 !important;
              }
              .header {
                  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%) !important;
                  color: #ffffff !important;
                  padding: 40px !important;
                  text-align: center !important;
                  position: relative !important;
              }
              .header:before {
                  content: '' !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  height: 4px !important;
                  background: linear-gradient(90deg, #7c3aed, #c4b5fd) !important;
              }
              .logo {
                  font-size: 40px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.5px !important;
                  margin: 0 0 10px 0 !important;
                  font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                  line-height: 1.2 !important;
              }
              .welcome-title {
                  font-size: 28px !important;
                  font-weight: 600 !important;
                  margin: 0 0 8px 0 !important;
                  line-height: 1.2 !important;
              }
              .welcome-subtitle {
                  font-size: 16px !important;
                  font-weight: 300 !important;
                  opacity: 0.9 !important;
                  margin: 0 !important;
                  line-height: 1.4 !important;
              }
              .content {
                  padding: 0 !important;
              }
              .company-info {
                  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%) !important;
                  padding: 30px !important;
                  text-align: center !important;
                  margin: 20px 0 !important;
                  border-top: 1px solid #d1d5db !important;
                  border-bottom: 1px solid #d1d5db !important;
              }
              .company-label {
                  font-size: 14px !important;
                  color: #6b7280 !important;
                  margin: 0 0 10px 0 !important;
                  text-transform: uppercase !important;
                  letter-spacing: 1.5px !important;
                  font-weight: 600 !important;
                  line-height: 1.2 !important;
              }
              .company-name {
                  font-size: 24px !important;
                  font-weight: 700 !important;
                  color: #1f2937 !important;
                  margin: 0 !important;
                  line-height: 1.3 !important;
              }
              .welcome-section {
                  padding: 40px !important;
                  text-align: center !important;
              }
              .greeting {
                  font-size: 24px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 0 20px 0 !important;
                  line-height: 1.3 !important;
              }
              .welcome-message {
                  color: #475569 !important;
                  margin: 0 0 30px 0 !important;
                  font-size: 16px !important;
                  line-height: 1.7 !important;
                  max-width: 500px !important;
                  margin-left: auto !important;
                  margin-right: auto !important;
              }
              .credentials-section {
                  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                  padding: 40px !important;
                  margin: 20px 0 !important;
                  border-top: 1px solid #e2e8f0 !important;
                  border-bottom: 1px solid #e2e8f0 !important;
              }
              .section-title {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #4f46e5 !important;
                  text-align: center !important;
                  margin: 0 0 30px 0 !important;
                  text-transform: uppercase !important;
                  letter-spacing: 1px !important;
                  line-height: 1.2 !important;
              }
              .credentials-grid {
                  display: grid !important;
                  grid-template-columns: 1fr 1fr !important;
                  gap: 25px !important;
                  margin: 0 auto !important;
                  max-width: 500px !important;
              }
              .credential-card {
                  background-color: #ffffff !important;
                  border-radius: 10px !important;
                  padding: 25px !important;
                  border: 1px solid #e2e8f0 !important;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
                  transition: transform 0.2s, box-shadow 0.2s !important;
              }
              .credential-card:hover {
                  transform: translateY(-2px) !important;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
              }
              .credential-icon {
                  font-size: 24px !important;
                  margin-bottom: 15px !important;
                  color: #8b5cf6 !important;
                  line-height: 1 !important;
              }
              .credential-label {
                  font-size: 13px !important;
                  color: #64748b !important;
                  margin: 0 0 8px 0 !important;
                  text-transform: uppercase !important;
                  letter-spacing: 1px !important;
                  font-weight: 600 !important;
                  line-height: 1.2 !important;
              }
              .credential-value {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 !important;
                  word-break: break-all !important;
                  line-height: 1.3 !important;
              }
              .password-value {
                  color: #dc2626 !important;
                  font-family: 'Courier New', monospace !important;
                  letter-spacing: 1px !important;
              }
              .steps-section {
                  padding: 40px !important;
              }
              .steps-title {
                  font-size: 22px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  text-align: center !important;
                  margin: 0 0 35px 0 !important;
                  position: relative !important;
                  padding-bottom: 15px !important;
                  line-height: 1.2 !important;
              }
              .steps-title:after {
                  content: '' !important;
                  position: absolute !important;
                  bottom: 0 !important;
                  left: 50% !important;
                  transform: translateX(-50%) !important;
                  width: 80px !important;
                  height: 3px !important;
                  background: linear-gradient(90deg, #8b5cf6, #a78bfa) !important;
              }
              .steps-grid {
                  display: grid !important;
                  grid-template-columns: 1fr 1fr !important;
                  gap: 25px !important;
              }
              .step-card {
                  background-color: #f8fafc !important;
                  border-radius: 10px !important;
                  padding: 30px !important;
                  border: 1px solid #e2e8f0 !important;
                  position: relative !important;
                  overflow: hidden !important;
              }
              .step-card:before {
                  content: '' !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  height: 4px !important;
                  background: linear-gradient(90deg, #7c3aed, #c4b5fd) !important;
              }
              .step-header {
                  display: flex !important;
                  align-items: center !important;
                  margin-bottom: 15px !important;
              }
              .step-number {
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  width: 36px !important;
                  height: 36px !important;
                  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
                  color: white !important;
                  border-radius: 50% !important;
                  font-weight: 700 !important;
                  font-size: 16px !important;
                  margin-right: 15px !important;
                  flex-shrink: 0 !important;
                  line-height: 1 !important;
              }
              .step-name {
                  font-size: 17px !important;
                  font-weight: 600 !important;
                  color: #1e293b !important;
                  margin: 0 !important;
                  line-height: 1.3 !important;
              }
              .step-description {
                  color: #475569 !important;
                  font-size: 14.5px !important;
                  line-height: 1.6 !important;
                  margin: 0 !important;
              }
              .security-section {
                  background-color: #fef3c7 !important;
                  padding: 30px 40px !important;
                  margin: 20px 0 !important;
                  border-top: 1px solid #fcd34d !important;
                  border-bottom: 1px solid #fcd34d !important;
              }
              .security-title {
                  font-size: 18px !important;
                  font-weight: 600 !important;
                  color: #92400e !important;
                  margin: 0 0 15px 0 !important;
                  display: flex !important;
                  align-items: center !important;
                  line-height: 1.3 !important;
              }
              .security-icon {
                  margin-right: 10px !important;
                  font-size: 20px !important;
              }
              .security-list {
                  list-style: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
              }
              .security-list li {
                  padding: 8px 0 !important;
                  color: #78350f !important;
                  font-size: 14.5px !important;
                  display: flex !important;
                  align-items: flex-start !important;
                  line-height: 1.5 !important;
              }
              .security-list li:before {
                  content: "•" !important;
                  color: #d97706 !important;
                  font-weight: bold !important;
                  display: inline-block !important;
                  width: 20px !important;
                  margin-left: -20px !important;
              }
              .app-download-section {
                  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%) !important;
                  border-radius: 12px !important;
                  margin: 20px 40px !important;
                  padding: 30px !important;
                  text-align: center !important;
                  border: 2px solid #fbbf24 !important;
              }
              .app-title {
                  font-size: 20px !important;
                  font-weight: 700 !important;
                  color: #92400e !important;
                  margin: 0 0 10px 0 !important;
              }
              .app-description {
                  color: #78350f !important;
                  margin: 0 0 25px 0 !important;
                  font-size: 15px !important;
                  line-height: 1.6 !important;
                  max-width: 500px !important;
                  margin-left: auto !important;
                  margin-right: auto !important;
              }
              .app-buttons {
                  display: flex !important;
                  justify-content: center !important;
                  gap: 20px !important;
                  flex-wrap: wrap !important;
                  margin-bottom: 20px !important;
              }
              .app-btn {
                  display: inline-block !important;
                  padding: 10px 20px !important;
                  text-decoration: none !important;
                  border-radius: 8px !important;
                  font-weight: 600 !important;
                  font-size: 13px !important;
                  margin-top: 5px !important;
                  transition: transform 0.2s !important;
              }
              .app-btn:hover {
                  transform: translateY(-2px) !important;
              }
              .android-btn {
                  background-color: #34d399 !important;
                  color: white !important;
              }
              .ios-btn {
                  background-color: #000000 !important;
                  color: white !important;
              }
              .web-link {
                  color: #dc2626 !important;
                  text-decoration: underline !important;
                  font-weight: 600 !important;
              }
              .support-section {
                  padding: 30px 40px !important;
                  text-align: center !important;
              }
              .support-message {
                  color: #475569 !important;
                  font-size: 15px !important;
                  line-height: 1.6 !important;
                  margin: 0 0 20px 0 !important;
              }
              .footer {
                  background-color: #1e293b !important;
                  color: #cbd5e1 !important;
                  padding: 30px 40px !important;
                  text-align: center !important;
              }
              .footer-logo {
                  font-size: 24px !important;
                  font-weight: 700 !important;
                  color: #ffffff !important;
                  margin: 0 0 15px 0 !important;
                  font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                  line-height: 1.2 !important;
              }
              .footer-text {
                  font-size: 13px !important;
                  margin: 8px 0 !important;
                  opacity: 0.8 !important;
                  line-height: 1.5 !important;
              }
              .footer-divider {
                  height: 1px !important;
                  background-color: #334155 !important;
                  margin: 20px 0 !important;
              }
              /* FALLBACK FOR OUTLOOK */
              .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                  line-height: 100% !important;
              }
              /* IOS FIX */
              a[x-apple-data-detectors] {
                  color: inherit !important;
                  text-decoration: none !important;
                  font-size: inherit !important;
                  font-family: inherit !important;
                  font-weight: inherit !important;
                  line-height: inherit !important;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <!--[if (gte mso 9)|(IE)]>
          <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
          <td>
          <![endif]-->
          
          <div class="container" style="max-width: 620px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              <div class="header" style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); color: #ffffff; padding: 40px; text-align: center; position: relative;">
                  <h1 class="logo" style="font-size: 40px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 10px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                  <h2 class="welcome-title" style="font-size: 28px; font-weight: 600; margin: 0 0 8px 0;">¡Bienvenido al Equipo!</h2>
                  <p class="welcome-subtitle" style="font-size: 16px; font-weight: 300; opacity: 0.9; margin: 0;">Sistema de Gestión de Citas Profesional</p>
              </div>
              
              <div class="content" style="padding: 0;">
                  <div class="company-info" style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); padding: 30px; text-align: center; margin: 20px 0; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db;">
                      <p class="company-label" style="font-size: 14px; color: #6b7280; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Compañía Asignada</p>
                      <h3 class="company-name" style="font-size: 24px; font-weight: 700; color: #1f2937; margin: 0;">${companyName}</h3>
                  </div>
                  
                  <div class="welcome-section" style="padding: 40px; text-align: center;">
                      <h2 class="greeting" style="font-size: 24px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0;">Estimado/a ${username},</h2>
                      <p class="welcome-message" style="color: #475569; margin: 0 0 30px 0; font-size: 16px; line-height: 1.7; max-width: 500px; margin-left: auto; margin-right: auto;">
                          Nos complace darle la bienvenida a CLYPS. Su cuenta ha sido creada exitosamente 
                          y ha sido asignado como trabajador en la compañía <strong>${companyName}</strong>. 
                          Estamos encantados de tenerle en nuestro equipo.
                      </p>
                  </div>
                  
                  <div class="credentials-section" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 40px; margin: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                      <h3 class="section-title" style="font-size: 18px; font-weight: 600; color: #4f46e5; text-align: center; margin: 0 0 30px 0; text-transform: uppercase; letter-spacing: 1px;">Sus Credenciales de Acceso</h3>
                      <div class="credentials-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin: 0 auto; max-width: 500px;">
                          <div class="credential-card" style="background-color: #ffffff; border-radius: 10px; padding: 25px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                              <div class="credential-icon" style="font-size: 24px; margin-bottom: 15px; color: #8b5cf6;">👤</div>
                              <p class="credential-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Usuario / Email</p>
                              <p class="credential-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${username}</p>
                          </div>
                          
                          <div class="credential-card" style="background-color: #ffffff; border-radius: 10px; padding: 25px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                              <div class="credential-icon" style="font-size: 24px; margin-bottom: 15px; color: #8b5cf6;">🔒</div>
                              <p class="credential-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Contraseña Temporal</p>
                              <p class="credential-value password-value" style="font-size: 18px; font-weight: 600; color: #dc2626; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">${password}</p>
                          </div>
                      </div>
                  </div>
                  
                  <div class="steps-section" style="padding: 40px;">
                      <h3 class="steps-title" style="font-size: 22px; font-weight: 600; color: #1e293b; text-align: center; margin: 0 0 35px 0; position: relative; padding-bottom: 15px;">Primeros Pasos en CLYPS</h3>
                      <div class="steps-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px;">
                          <div class="step-card" style="background-color: #f8fafc; border-radius: 10px; padding: 30px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                              <div class="step-header" style="display: flex; align-items: center; margin-bottom: 15px;">
                                  <div class="step-number" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 50%; font-weight: 700; font-size: 16px; margin-right: 15px;">1</div>
                                  <h4 class="step-name" style="font-size: 17px; font-weight: 600; color: #1e293b; margin: 0;">Inicio de Sesión</h4>
                              </div>
                              <p class="step-description" style="color: #475569; font-size: 14.5px; line-height: 1.6; margin: 0;">
                                  Acceda al sistema utilizando las credenciales proporcionadas. 
                                  Recuerde que trabajará para la compañía <strong>${companyName}</strong>.
                              </p>
                          </div>
                          
                          <div class="step-card" style="background-color: #f8fafc; border-radius: 10px; padding: 30px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                              <div class="step-header" style="display: flex; align-items: center; margin-bottom: 15px;">
                                  <div class="step-number" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 50%; font-weight: 700; font-size: 16px; margin-right: 15px;">2</div>
                                  <h4 class="step-name" style="font-size: 17px; font-weight: 600; color: #1e293b; margin: 0;">Verificación de Cuenta</h4>
                              </div>
                              <p class="step-description" style="color: #475569; font-size: 14.5px; line-height: 1.6; margin: 0;">
                                  Verifique su cuenta mediante el código que recibirá en su correo electrónico. 
                                  Este paso es esencial para garantizar la seguridad de su acceso.
                              </p>
                          </div>
                          
                          <div class="step-card" style="background-color: #f8fafc; border-radius: 10px; padding: 30px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                              <div class="step-header" style="display: flex; align-items: center; margin-bottom: 15px;">
                                  <div class="step-number" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 50%; font-weight: 700; font-size: 16px; margin-right: 15px;">3</div>
                                  <h4 class="step-name" style="font-size: 17px; font-weight: 600; color: #1e293b; margin: 0;">Actualización de Seguridad</h4>
                              </div>
                              <p class="step-description" style="color: #475569; font-size: 14.5px; line-height: 1.6; margin: 0;">
                                  Cambie su contraseña temporal por una permanente en la sección de Perfil. 
                                  Utilice una combinación segura de caracteres para mayor protección.
                              </p>
                          </div>
                          
                          <div class="step-card" style="background-color: #f8fafc; border-radius: 10px; padding: 30px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;">
                              <div class="step-header" style="display: flex; align-items: center; margin-bottom: 15px;">
                                  <div class="step-number" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border-radius: 50%; font-weight: 700; font-size: 16px; margin-right: 15px;">4</div>
                                  <h4 class="step-name" style="font-size: 17px; font-weight: 600; color: #1e293b; margin: 0;">Configuración de Perfil</h4>
                              </div>
                              <p class="step-description" style="color: #475569; font-size: 14.5px; line-height: 1.6; margin: 0;">
                                  Complete su perfil profesional para la compañía <strong>${companyName}</strong> 
                                  con su información personal, especialidades y horarios de disponibilidad.
                              </p>
                          </div>
                      </div>
                  </div>
                  
                  <!-- SECCIÓN DE DESCARGA DE APP -->
                  <div class="app-download-section" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; margin: 20px 40px; padding: 30px; text-align: center; border: 2px solid #fbbf24;">
                      <div style="font-size: 28px; margin-bottom: 15px;">📱</div>
                      <h3 class="app-title" style="font-size: 20px; font-weight: 700; color: #92400e; margin: 0 0 10px 0;">
                          ¡Optimiza tu trabajo con nuestra App!
                      </h3>
                      <p class="app-description" style="color: #78350f; margin: 0 0 25px 0; font-size: 15px; line-height: 1.6; max-width: 500px; margin-left: auto; margin-right: auto;">
                          Descarga la app móvil de CLYPS para gestionar tus citas, clientes y horarios 
                          directamente desde tu teléfono.
                      </p>
                      
                      <div class="app-buttons" style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
                          <div style="text-align: center;">
                              <div style="background-color: #34d399; color: white; width: 50px; height: 50px; line-height: 50px; border-radius: 12px; margin: 0 auto 10px; font-size: 24px;">
                                  🤖
                              </div>
                              <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                                 class="app-btn android-btn" 
                                 style="display: inline-block; background-color: #34d399; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 5px;">
                                  Google Play
                              </a>
                          </div>
                          
                          <div style="text-align: center;">
                              <div style="background-color: #000000; color: white; width: 50px; height: 50px; line-height: 50px; border-radius: 12px; margin: 0 auto 10px; font-size: 24px;">
                                  🍎
                              </div>
                              <a href="https://apps.apple.com/app/id1645438827" 
                                 class="app-btn ios-btn" 
                                 style="display: inline-block; background-color: #000000; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 5px;">
                                  App Store
                              </a>
                          </div>
                      </div>
                      
                      <p style="color: #92400e; font-size: 14px; margin-top: 15px; font-weight: 600;">
                          🔗 Enlace directo: <a href="https://app.clyps.com" class="web-link" style="color: #dc2626; text-decoration: underline;">app.clyps.com</a>
                      </p>
                  </div>
                  <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                  
                  <div class="security-section" style="background-color: #fef3c7; padding: 30px 40px; margin: 20px 0; border-top: 1px solid #fcd34d; border-bottom: 1px solid #fcd34d;">
                      <h3 class="security-title" style="font-size: 18px; font-weight: 600; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                          <span class="security-icon" style="margin-right: 10px; font-size: 20px;">⚠️</span>
                          Directrices de Seguridad
                      </h3>
                      <ul class="security-list" style="list-style: none; padding: 0; margin: 0;">
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Esta contraseña es temporal y debe ser cambiada inmediatamente después de su primer acceso.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">No comparta sus credenciales con nadie, incluyendo otros miembros del equipo.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Utilice contraseñas diferentes para cada servicio y aplicación.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Si detecta actividad sospechosa, contacte inmediatamente con el administrador de <strong>${companyName}</strong>.</li>
                      </ul>
                  </div>
                  
                  <div class="support-section" style="padding: 30px 40px; text-align: center;">
                      <p class="support-message" style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                          Para cualquier consulta relacionada con su asignación en <strong>${companyName}</strong>, 
                          contacte con el administrador de la compañía. 
                          Nuestro equipo de soporte también está disponible para asistirle.
                      </p>
                  </div>
              </div>
              
              <div class="footer" style="background-color: #1e293b; color: #cbd5e1; padding: 30px 40px; text-align: center;">
                  <h3 class="footer-logo" style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 15px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h3>
                  <p class="footer-text" style="font-size: 13px; margin: 8px 0; opacity: 0.8;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                  <p class="footer-text" style="font-size: 13px; margin: 8px 0; opacity: 0.8;">Sistema de Gestión de Citas Profesional</p>
                  <div class="footer-divider" style="height: 1px; background-color: #334155; margin: 20px 0;"></div>
                  <p class="footer-text" style="font-size: 12px; margin: 8px 0; opacity: 0.7;">
                      Este correo contiene información confidencial. Por favor, no lo comparta ni reenvíe.
                  </p>
              </div>
          </div>
          
          <!--[if (gte mso 9)|(IE)]>
          </td>
          </tr>
          </table>
          <![endif]-->
      </body>
      </html>
    `;
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
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenido a CLYPS - Tus Credenciales</title>
          <style type="text/css">
              /* RESET */
              body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
              img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
              table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
              
              /* MOBILE STYLES */
              @media screen and (max-width: 630px) {
                  .container {
                      width: 94% !important;
                      margin: 0 auto !important;
                      padding: 10px !important;
                  }
                  .header {
                      padding: 20px 15px !important;
                      text-align: center !important;
                  }
                  .content {
                      padding: 20px 15px !important;
                  }
                  .logo {
                      font-size: 28px !important;
                      line-height: 32px !important;
                  }
                  .header p {
                      font-size: 14px !important;
                      line-height: 18px !important;
                  }
                  h2 {
                      font-size: 22px !important;
                      line-height: 26px !important;
                  }
                  .credentials {
                      padding: 15px !important;
                      margin: 15px 0 !important;
                  }
                  .credential-item {
                      margin: 8px 0 !important;
                  }
                  .value {
                      font-size: 14px !important;
                      padding: 8px 12px !important;
                  }
                  .warning {
                      padding: 15px !important;
                      margin: 15px 0 !important;
                  }
                  .app-download {
                      padding: 20px !important;
                      margin: 20px 0 !important;
                  }
                  .app-title {
                      font-size: 18px !important;
                      line-height: 22px !important;
                  }
                  .app-description {
                      font-size: 14px !important;
                      line-height: 1.5 !important;
                      margin-bottom: 15px !important;
                  }
                  .store-buttons {
                      flex-direction: column !important;
                      gap: 10px !important;
                      margin-bottom: 15px !important;
                  }
                  .store-btn {
                      padding: 10px 15px !important;
                      font-size: 13px !important;
                  }
                  .footer {
                      padding: 20px 15px !important;
                  }
                  .footer p {
                      font-size: 12px !important;
                      line-height: 16px !important;
                  }
              }
              
              /* DESKTOP STYLES */
              body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  background-color: #f4f4f4 !important;
                  font-family: Arial, sans-serif !important;
                  line-height: 1.6 !important;
                  color: #333 !important;
              }
              .container {
                  max-width: 600px !important;
                  width: 100% !important;
                  margin: 20px auto !important;
                  background-color: white !important;
                  padding: 30px !important;
                  border-radius: 10px !important;
              }
              .header {
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                  color: white !important;
                  padding: 20px !important;
                  text-align: center !important;
                  border-radius: 10px 10px 0 0 !important;
              }
              .logo {
                  font-size: 32px !important;
                  font-weight: bold !important;
                  margin: 0 0 10px 0 !important;
                  line-height: 1.2 !important;
              }
              .header p {
                  font-size: 16px !important;
                  margin: 0 !important;
                  opacity: 0.9 !important;
                  line-height: 1.4 !important;
              }
              .content {
                  padding: 20px !important;
              }
              h2 {
                  font-size: 24px !important;
                  color: #333 !important;
                  margin: 0 0 15px 0 !important;
                  line-height: 1.3 !important;
              }
              p {
                  color: #666 !important;
                  margin: 0 0 15px 0 !important;
                  line-height: 1.6 !important;
              }
              .credentials {
                  background-color: #f8f9fa !important;
                  padding: 20px !important;
                  border-radius: 5px !important;
                  margin: 20px 0 !important;
              }
              .credential-item {
                  margin: 10px 0 !important;
              }
              .label {
                  font-weight: bold !important;
                  color: #333 !important;
                  display: block !important;
                  margin-bottom: 5px !important;
                  line-height: 1.4 !important;
              }
              .value {
                  font-family: 'Courier New', monospace !important;
                  background-color: #e9ecef !important;
                  padding: 10px 15px !important;
                  border-radius: 3px !important;
                  display: block !important;
                  word-break: break-all !important;
                  line-height: 1.4 !important;
              }
              .warning {
                  background-color: #fff3cd !important;
                  border: 1px solid #ffeaa7 !important;
                  padding: 15px !important;
                  border-radius: 5px !important;
                  margin: 20px 0 !important;
              }
              .warning strong {
                  color: #856404 !important;
                  display: block !important;
                  margin-bottom: 10px !important;
                  line-height: 1.4 !important;
              }
              .warning ul {
                  margin: 10px 0 !important;
                  padding-left: 20px !important;
              }
              .warning li {
                  margin-bottom: 5px !important;
                  color: #856404 !important;
                  line-height: 1.5 !important;
              }
              .app-download {
                  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
                  padding: 25px !important;
                  border-radius: 10px !important;
                  margin: 25px 0 !important;
                  text-align: center !important;
                  border: 2px solid #7dd3fc !important;
              }
              .app-title {
                  color: #0369a1 !important;
                  font-size: 20px !important;
                  font-weight: bold !important;
                  margin-bottom: 10px !important;
                  line-height: 1.3 !important;
              }
              .app-description {
                  color: #475569 !important;
                  margin-bottom: 20px !important;
                  font-size: 15px !important;
                  line-height: 1.6 !important;
              }
              .store-buttons {
                  display: flex !important;
                  justify-content: center !important;
                  gap: 15px !important;
                  margin-bottom: 15px !important;
                  flex-wrap: wrap !important;
              }
              .store-btn {
                  padding: 12px 20px !important;
                  border-radius: 8px !important;
                  text-decoration: none !important;
                  font-weight: bold !important;
                  font-size: 14px !important;
                  display: inline-flex !important;
                  align-items: center !important;
                  gap: 8px !important;
                  transition: transform 0.2s !important;
              }
              .store-btn:hover {
                  transform: translateY(-2px) !important;
              }
              .android-btn {
                  background-color: #34d399 !important;
                  color: white !important;
              }
              .ios-btn {
                  background-color: #000000 !important;
                  color: white !important;
              }
              .web-link {
                  color: #4f46e5 !important;
                  font-weight: 600 !important;
                  text-decoration: none !important;
              }
              ol {
                  margin: 15px 0 !important;
                  padding-left: 20px !important;
              }
              ol li {
                  margin-bottom: 8px !important;
                  color: #475569 !important;
                  line-height: 1.5 !important;
              }
              .footer {
                  text-align: center !important;
                  color: #666 !important;
                  font-size: 12px !important;
                  margin-top: 20px !important;
                  padding-top: 20px !important;
                  border-top: 1px solid #eee !important;
              }
              .footer p {
                  margin: 5px 0 !important;
                  line-height: 1.5 !important;
              }
          </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
          <div class="container" style="max-width: 600px; margin: 20px auto; background-color: white; padding: 30px; border-radius: 10px;">
              <div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 class="logo" style="font-size: 32px; font-weight: bold; margin: 0 0 10px 0;">CLYPS</h1>
                  <p style="font-size: 16px; margin: 0; opacity: 0.9;">Sistema de Gestión de Citas</p>
              </div>
              
              <div class="content" style="padding: 20px;">
                  <h2 style="font-size: 24px; color: #333; margin: 0 0 15px 0;">¡Bienvenido/a ${username}!</h2>
                  <p style="color: #666; margin: 0 0 15px 0;">Tu cuenta de cliente ha sido creada exitosamente en CLYPS.</p>
                  
                  <div class="credentials" style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                      <h3 style="color: #333; margin: 0 0 15px 0;">Tus Credenciales de Acceso:</h3>
                      <div class="credential-item" style="margin: 10px 0;">
                          <span class="label" style="font-weight: bold; color: #333; display: block; margin-bottom: 5px;">Usuario/Email:</span>
                          <div class="value" style="font-family: 'Courier New', monospace; background-color: #e9ecef; padding: 10px 15px; border-radius: 3px; display: block; word-break: break-all;">${username}</div>
                      </div>
                      <div class="credential-item" style="margin: 10px 0;">
                          <span class="label" style="font-weight: bold; color: #333; display: block; margin-bottom: 5px;">Contraseña Temporal:</span>
                          <div class="value" style="font-family: 'Courier New', monospace; background-color: #e9ecef; padding: 10px 15px; border-radius: 3px; display: block; word-break: break-all;">${password}</div>
                      </div>
                  </div>
                  
                  <div class="warning" style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                      <strong style="color: #856404; display: block; margin-bottom: 10px;">⚠️ IMPORTANTE:</strong>
                      <p style="color: #856404; margin: 0 0 10px 0;">Esta contraseña es temporal. Por seguridad, te recomendamos:</p>
                      <ul style="margin: 10px 0; padding-left: 20px;">
                          <li style="margin-bottom: 5px; color: #856404;">Cambiar tu contraseña después del primer inicio de sesión</li>
                          <li style="margin-bottom: 5px; color: #856404;">No compartas tus credenciales con nadie</li>
                          <li style="margin-bottom: 5px; color: #856404;">Verifica tu correo electrónico para activar tu cuenta</li>
                      </ul>
                  </div>
                  
                  <!-- SECCIÓN DE APP MÓVIL -->
                  <div class="app-download" style="background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center; border: 2px solid #7dd3fc;">
                      <div class="app-title" style="color: #0369a1; font-size: 20px; font-weight: bold; margin-bottom: 10px;">📱 ¡Lleva CLYPS en tu bolsillo!</div>
                      <div class="app-description" style="color: #475569; margin-bottom: 20px; font-size: 15px; line-height: 1.6;">
                          Reserva y gestiona tus citas fácilmente desde tu teléfono. 
                          Descarga nuestra app móvil y ten acceso instantáneo a todos tus servicios.
                      </div>
                      
                      <div class="store-buttons" style="display: flex; justify-content: center; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                          <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                             class="store-btn android-btn" 
                             style="padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; background-color: #34d399; color: white;">
                              🟢 Google Play
                          </a>
                          <a href="https://apps.apple.com/app/id1645438827" 
                             class="store-btn ios-btn" 
                             style="padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; background-color: #000000; color: white;">
                              ⚫ App Store
                          </a>
                      </div>
                      
                      <p style="color: #64748b; font-size: 14px; margin-top: 15px;">
                          O accede desde tu navegador: 
                          <a href="https://app.clyps.com" class="web-link" style="color: #4f46e5; font-weight: 600; text-decoration: none;">app.clyps.com</a>
                      </p>
                  </div>
                  <!-- FIN SECCIÓN DE APP MÓVIL -->
                  
                  <p><strong style="color: #333; display: block; margin-bottom: 10px;">Próximos pasos:</strong></p>
                  <ol style="margin: 15px 0; padding-left: 20px;">
                      <li style="margin-bottom: 8px; color: #475569;">Inicia sesión en CLYPS usando las credenciales proporcionadas</li>
                      <li style="margin-bottom: 8px; color: #475569;">Verifica tu correo electrónico con el código que recibirás</li>
                      <li style="margin-bottom: 8px; color: #475569;">Completa tu perfil de cliente</li>
                      <li style="margin-bottom: 8px; color: #475569;">Comienza a reservar citas con nuestros profesionales</li>
                  </ol>
                  
                  <p style="color: #666; margin: 15px 0 0 0;">Si tienes alguna pregunta, no dudes en contactar a nuestro equipo de soporte.</p>
              </div>
              
              <div class="footer" style="text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                  <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                  <p style="margin: 5px 0;">Este es un mensaje automático, por favor no responder.</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  private getSessionConfirmationTemplate(
    clientName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
    },
    workerInfo: {
      name: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Confirmación de Cita - CLYPS</title>
        <style type="text/css">
            /* RESET */
            body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
            img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            
            /* MOBILE STYLES */
            @media screen and (max-width: 630px) {
                .container {
                    width: 94% !important;
                    margin: 0 auto !important;
                    padding: 10px !important;
                }
                .header {
                    padding: 25px 20px !important;
                    text-align: center !important;
                }
                .content {
                    padding: 25px 20px !important;
                }
                .logo {
                    font-size: 28px !important;
                    line-height: 32px !important;
                }
                .tagline {
                    font-size: 14px !important;
                    line-height: 18px !important;
                }
                .greeting {
                    font-size: 20px !important;
                    line-height: 24px !important;
                    margin-bottom: 15px !important;
                }
                .message {
                    font-size: 15px !important;
                    line-height: 22px !important;
                }
                .appointment-card {
                    padding: 25px 20px !important;
                    margin: 20px 0 !important;
                }
                .appointment-title {
                    font-size: 20px !important;
                    line-height: 24px !important;
                }
                .appointment-grid {
                    grid-template-columns: 1fr !important;
                    gap: 15px !important;
                }
                .detail-card {
                    padding: 20px !important;
                }
                .detail-label {
                    font-size: 12px !important;
                    margin-bottom: 8px !important;
                }
                .detail-value {
                    font-size: 16px !important;
                    line-height: 20px !important;
                }
                .section-title {
                    font-size: 18px !important;
                    line-height: 22px !important;
                }
                .info-card, .reminder-card {
                    padding: 18px !important;
                    margin: 15px 0 !important;
                }
                .app-download-section {
                    padding: 20px !important;
                    margin: 20px 0 !important;
                }
                .app-buttons {
                    flex-direction: column !important;
                    gap: 10px !important;
                }
                .app-btn {
                    padding: 10px 15px !important;
                    font-size: 13px !important;
                }
                .footer {
                    padding: 20px !important;
                }
                .footer p {
                    font-size: 12px !important;
                    line-height: 16px !important;
                }
                .divider {
                    margin: 20px 0 !important;
                }
            }
            
            /* DESKTOP STYLES */
            body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                background-color: #f8fafc !important;
                font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                line-height: 1.6 !important;
                color: #334155 !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
            }
            .container {
                max-width: 580px !important;
                width: 100% !important;
                margin: 30px auto !important;
                background-color: #ffffff !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                border: 1px solid #e2e8f0 !important;
            }
            .header {
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
                color: #ffffff !important;
                padding: 35px 40px !important;
                text-align: center !important;
                position: relative !important;
            }
            .header:before {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 4px !important;
                background: linear-gradient(90deg, #3b82f6, #8b5cf6) !important;
            }
            .logo {
                font-size: 36px !important;
                font-weight: 700 !important;
                letter-spacing: 0.5px !important;
                margin: 0 0 8px 0 !important;
                font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                line-height: 1.2 !important;
            }
            .tagline {
                font-size: 15px !important;
                font-weight: 300 !important;
                opacity: 0.9 !important;
                margin: 0 !important;
                line-height: 1.4 !important;
            }
            .content {
                padding: 40px !important;
            }
            .greeting {
                font-size: 22px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 0 20px 0 !important;
                border-bottom: 2px solid #f1f5f9 !important;
                padding-bottom: 15px !important;
                line-height: 1.3 !important;
            }
            .message {
                color: #475569 !important;
                margin: 0 0 30px 0 !important;
                font-size: 15.5px !important;
                line-height: 1.7 !important;
            }
            .appointment-card {
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                border-radius: 10px !important;
                padding: 35px !important;
                margin: 35px 0 !important;
                border: 1px solid #e2e8f0 !important;
                position: relative !important;
            }
            .appointment-title {
                font-size: 22px !important;
                font-weight: 600 !important;
                color: #4f46e5 !important;
                text-align: center !important;
                margin: 0 0 25px 0 !important;
                line-height: 1.2 !important;
            }
            .appointment-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 20px !important;
                margin: 0 0 25px 0 !important;
            }
            .detail-card {
                background-color: #ffffff !important;
                border-radius: 8px !important;
                padding: 20px !important;
                border: 1px solid #e2e8f0 !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
            }
            .detail-icon {
                font-size: 20px !important;
                margin-bottom: 12px !important;
                color: #4f46e5 !important;
                line-height: 1 !important;
            }
            .detail-label {
                font-size: 13px !important;
                color: #64748b !important;
                margin: 0 0 8px 0 !important;
                text-transform: uppercase !important;
                letter-spacing: 1px !important;
                font-weight: 600 !important;
                line-height: 1.2 !important;
            }
            .detail-value {
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 !important;
                line-height: 1.3 !important;
            }
            .section-title {
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 0 15px 0 !important;
                border-bottom: 2px solid #f1f5f9 !important;
                padding-bottom: 10px !important;
                line-height: 1.3 !important;
            }
            .info-card {
                background-color: #f0f9ff !important;
                border-radius: 8px !important;
                padding: 25px !important;
                margin: 25px 0 !important;
                border: 1px solid #bae6fd !important;
            }
            .info-item {
                margin-bottom: 12px !important;
                line-height: 1.5 !important;
            }
            .info-item:last-child {
                margin-bottom: 0 !important;
            }
            .info-label {
                font-weight: 600 !important;
                color: #0369a1 !important;
                display: inline-block !important;
                width: 120px !important;
            }
            .info-value {
                color: #475569 !important;
            }
            .reminder-card {
                background-color: #fff7ed !important;
                border-radius: 8px !important;
                padding: 25px !important;
                margin: 25px 0 !important;
                border: 1px solid #fdba74 !important;
            }
            .reminder-title {
                font-size: 16px !important;
                font-weight: 600 !important;
                color: #92400e !important;
                margin: 0 0 15px 0 !important;
                display: flex !important;
                align-items: center !important;
            }
            .reminder-icon {
                margin-right: 10px !important;
                font-size: 18px !important;
            }
            .reminder-list {
                list-style: none !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .reminder-list li {
                padding: 8px 0 !important;
                color: #92400e !important;
                font-size: 14.5px !important;
                border-bottom: 1px solid #fed7aa !important;
                display: flex !important;
                align-items: flex-start !important;
                line-height: 1.5 !important;
            }
            .reminder-list li:last-child {
                border-bottom: none !important;
            }
            .reminder-list li:before {
                content: "✓" !important;
                color: #ea580c !important;
                font-weight: bold !important;
                display: inline-block !important;
                width: 20px !important;
                margin-left: -20px !important;
            }
            .app-download-section {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%) !important;
                border-radius: 10px !important;
                padding: 30px !important;
                margin: 35px 0 !important;
                text-align: center !important;
                border: 2px solid #fbbf24 !important;
            }
            .app-title {
                font-size: 18px !important;
                font-weight: 700 !important;
                color: #92400e !important;
                margin: 0 0 15px 0 !important;
            }
            .app-description {
                color: #78350f !important;
                margin: 0 0 20px 0 !important;
                font-size: 15px !important;
                line-height: 1.6 !important;
            }
            .app-buttons {
                display: flex !important;
                justify-content: center !important;
                gap: 15px !important;
                flex-wrap: wrap !important;
                margin-bottom: 20px !important;
            }
            .app-btn {
                display: inline-block !important;
                padding: 12px 25px !important;
                text-decoration: none !important;
                border-radius: 8px !important;
                font-weight: 600 !important;
                font-size: 14px !important;
                transition: transform 0.2s !important;
            }
            .app-btn:hover {
                transform: translateY(-2px) !important;
            }
            .android-btn {
                background-color: #34d399 !important;
                color: white !important;
            }
            .ios-btn {
                background-color: #000000 !important;
                color: white !important;
            }
            .web-link {
                color: #92400e !important;
                font-weight: 600 !important;
                text-decoration: underline !important;
            }
            .footer {
                background-color: #f8fafc !important;
                padding: 25px 40px !important;
                text-align: center !important;
                border-top: 1px solid #e2e8f0 !important;
                color: #64748b !important;
                font-size: 13px !important;
            }
            .footer p {
                margin: 5px 0 !important;
                line-height: 1.5 !important;
            }
            .divider {
                height: 1px !important;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                margin: 30px 0 !important;
            }
            /* FALLBACK FOR OUTLOOK */
            .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                line-height: 100% !important;
            }
            /* IOS FIX */
            a[x-apple-data-detectors] {
                color: inherit !important;
                text-decoration: none !important;
                font-size: inherit !important;
                font-family: inherit !important;
                font-weight: inherit !important;
                line-height: inherit !important;
            }
        </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <!--[if (gte mso 9)|(IE)]>
        <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
        <tr>
        <td>
        <![endif]-->
        
        <div class="container" style="max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
            <div class="header" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 35px 40px; text-align: center; position: relative;">
                <h1 class="logo" style="font-size: 36px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                <p class="tagline" style="font-size: 15px; font-weight: 300; opacity: 0.9; margin: 0;">Confirmación de Cita</p>
            </div>
            
            <div class="content" style="padding: 40px;">
                <h2 class="greeting" style="font-size: 22px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">Estimado/a ${clientName},</h2>
                
                <p class="message" style="color: #475569; margin: 0 0 30px 0; font-size: 15.5px; line-height: 1.7;">
                    Tu cita ha sido programada exitosamente. A continuación encontrarás todos los detalles 
                    importantes para que estés completamente preparado/a.
                </p>
                
                <div class="appointment-card" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; padding: 35px; margin: 35px 0; border: 1px solid #e2e8f0;">
                    <h3 class="appointment-title" style="font-size: 22px; font-weight: 600; color: #4f46e5; text-align: center; margin: 0 0 25px 0;">📅 Detalles de tu cita</h3>
                    
                    <div class="appointment-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 0 0 25px 0;">
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">📅</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Fecha</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.date}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">🕐</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Hora</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.time}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">💼</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Servicio</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.serviceName}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">⏱️</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Duración</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.serviceDuration} minutos</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">💰</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Costo</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${this.formatMoney(sessionData.serviceCost, sessionData.serviceCurrency)}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #4f46e5;">👤</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Profesional</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${workerInfo.name}</div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px;">
                        <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.5;">
                            📍 Ubicación: <strong>${companyInfo.address}</strong>
                        </p>
                    </div>
                </div>
                
                <h4 class="section-title" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0 0 15px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">📋 Información de contacto</h4>
                
                <div class="info-card" style="background-color: #f0f9ff; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #bae6fd;">
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Compañía:</span>
                        <span class="info-value" style="color: #475569;">${companyInfo.name}</span>
                    </div>
                    ${
                      companyInfo.address
                        ? `
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Dirección:</span>
                        <span class="info-value" style="color: #475569;">${companyInfo.address}</span>
                    </div>
                    `
                        : ''
                    }
                    ${
                      companyInfo.email
                        ? `
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Email de la compañia:</span>
                        <span class="info-value" style="color: #475569;">${companyInfo.email}</span>
                    </div>
                    `
                        : ''
                    }
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Profesional:</span>
                        <span class="info-value" style="color: #475569;">${workerInfo.name}</span>
                    </div>
                    ${
                      workerInfo.phone
                        ? `
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Teléfono:</span>
                        <span class="info-value" style="color: #475569;">${workerInfo.phone}</span>
                    </div>
                    `
                        : ''
                    }
                </div>
                
                <div class="reminder-card" style="background-color: #fff7ed; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #fdba74;">
                    <h4 class="reminder-title" style="font-size: 16px; font-weight: 600; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                        <span class="reminder-icon" style="margin-right: 10px; font-size: 18px;">📌</span>
                        Recordatorios importantes
                    </h4>
                    <ul class="reminder-list" style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">Llega 10-15 minutos antes de tu cita</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">Trae cualquier documento o material necesario</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">En caso de cancelación, hazlo con al menos 24 horas de anticipación</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Contacta directamente con ${companyInfo.name} si tienes alguna pregunta</li>
                    </ul>
                </div>
                
                <!-- SECCIÓN DE DESCARGA DE APP -->
                <div class="app-download-section" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #fbbf24;">
                    <h3 class="app-title" style="font-size: 18px; font-weight: 700; color: #92400e; margin: 0 0 15px 0;">
                        📱 ¡Gestiona tus citas desde tu teléfono!
                    </h3>
                    <p class="app-description" style="color: #78350f; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                        Descarga la app de CLYPS para ver, modificar o cancelar tus citas desde cualquier lugar. 
                        ¡Es mucho más conveniente!
                    </p>
                    <div class="app-buttons" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
                        <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                           class="app-btn android-btn" 
                           style="display: inline-block; background-color: #34d399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            🟢 Google Play
                        </a>
                        <a href="https://apps.apple.com/app/id1645438827" 
                           class="app-btn ios-btn" 
                           style="display: inline-block; background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            ⚫ App Store
                        </a>
                    </div>
                    <p style="color: #78350f; font-size: 14px; margin-top: 15px; line-height: 1.5;">
                        O accede desde tu navegador: 
                        <a href="https://app.clyps.com" class="web-link" style="color: #92400e; font-weight: 600; text-decoration: underline;">app.clyps.com</a>
                    </p>
                </div>
                <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                
                <div class="divider" style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 30px 0;"></div>
                
                <p style="text-align: center; color: #64748b; font-size: 14px; line-height: 1.6;">
                    Si tienes alguna pregunta sobre tu cita, no dudes en contactar directamente con 
                    <strong>${companyInfo.name}</strong>.
                </p>
            </div>
            
            <div class="footer" style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                <p style="margin: 5px 0;">Sistema de Gestión de Citas Profesional</p>
                <p style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
                    Este es un mensaje automático de confirmación, por favor no responder a este correo.
                </p>
            </div>
        </div>
        
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
    </body>
    </html>
  `;
  }

  private getSessionNotificationTemplate(
    workerName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      clientName: string;
      clientPhone?: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
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
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Nueva Cita Asignada - CLYPS</title>
        <style type="text/css">
            /* RESET */
            body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
            img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            
            /* MOBILE STYLES */
            @media screen and (max-width: 630px) {
                .container {
                    width: 94% !important;
                    margin: 0 auto !important;
                    padding: 10px !important;
                }
                .header {
                    padding: 25px 20px !important;
                    text-align: center !important;
                }
                .content {
                    padding: 25px 20px !important;
                }
                .logo {
                    font-size: 28px !important;
                    line-height: 32px !important;
                }
                .tagline {
                    font-size: 14px !important;
                    line-height: 18px !important;
                }
                .greeting {
                    font-size: 20px !important;
                    line-height: 24px !important;
                    margin-bottom: 15px !important;
                }
                .message {
                    font-size: 15px !important;
                    line-height: 22px !important;
                }
                .appointment-card {
                    padding: 25px 20px !important;
                    margin: 20px 0 !important;
                }
                .appointment-title {
                    font-size: 20px !important;
                    line-height: 24px !important;
                }
                .appointment-grid {
                    grid-template-columns: 1fr !important;
                    gap: 15px !important;
                }
                .detail-card {
                    padding: 20px !important;
                }
                .detail-label {
                    font-size: 12px !important;
                    margin-bottom: 8px !important;
                }
                .detail-value {
                    font-size: 16px !important;
                    line-height: 20px !important;
                }
                .section-title {
                    font-size: 18px !important;
                    line-height: 22px !important;
                }
                .info-card, .reminder-card {
                    padding: 18px !important;
                    margin: 15px 0 !important;
                }
                .app-download-section {
                    padding: 20px !important;
                    margin: 20px 0 !important;
                }
                .app-buttons {
                    flex-direction: column !important;
                    gap: 10px !important;
                }
                .app-btn {
                    padding: 10px 15px !important;
                    font-size: 13px !important;
                }
                .footer {
                    padding: 20px !important;
                }
                .footer p {
                    font-size: 12px !important;
                    line-height: 16px !important;
                }
                .divider {
                    margin: 20px 0 !important;
                }
            }
            
            /* DESKTOP STYLES */
            body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                background-color: #f8fafc !important;
                font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
                line-height: 1.6 !important;
                color: #334155 !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
            }
            .container {
                max-width: 580px !important;
                width: 100% !important;
                margin: 30px auto !important;
                background-color: #ffffff !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
                border: 1px solid #e2e8f0 !important;
            }
            .header {
                background: linear-gradient(135deg, #059669 0%, #10b981 100%) !important;
                color: #ffffff !important;
                padding: 35px 40px !important;
                text-align: center !important;
                position: relative !important;
            }
            .header:before {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 4px !important;
                background: linear-gradient(90deg, #047857, #34d399) !important;
            }
            .logo {
                font-size: 36px !important;
                font-weight: 700 !important;
                letter-spacing: 0.5px !important;
                margin: 0 0 8px 0 !important;
                font-family: 'Arial Black', 'Segoe UI', sans-serif !important;
                line-height: 1.2 !important;
            }
            .tagline {
                font-size: 15px !important;
                font-weight: 300 !important;
                opacity: 0.9 !important;
                margin: 0 !important;
                line-height: 1.4 !important;
            }
            .content {
                padding: 40px !important;
            }
            .greeting {
                font-size: 22px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 0 20px 0 !important;
                border-bottom: 2px solid #f1f5f9 !important;
                padding-bottom: 15px !important;
                line-height: 1.3 !important;
            }
            .message {
                color: #475569 !important;
                margin: 0 0 30px 0 !important;
                font-size: 15.5px !important;
                line-height: 1.7 !important;
            }
            .appointment-card {
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                border-radius: 10px !important;
                padding: 35px !important;
                margin: 35px 0 !important;
                border: 1px solid #e2e8f0 !important;
                position: relative !important;
            }
            .appointment-title {
                font-size: 22px !important;
                font-weight: 600 !important;
                color: #059669 !important;
                text-align: center !important;
                margin: 0 0 25px 0 !important;
                line-height: 1.2 !important;
            }
            .appointment-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 20px !important;
                margin: 0 0 25px 0 !important;
            }
            .detail-card {
                background-color: #ffffff !important;
                border-radius: 8px !important;
                padding: 20px !important;
                border: 1px solid #e2e8f0 !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
            }
            .detail-icon {
                font-size: 20px !important;
                margin-bottom: 12px !important;
                color: #059669 !important;
                line-height: 1 !important;
            }
            .detail-label {
                font-size: 13px !important;
                color: #64748b !important;
                margin: 0 0 8px 0 !important;
                text-transform: uppercase !important;
                letter-spacing: 1px !important;
                font-weight: 600 !important;
                line-height: 1.2 !important;
            }
            .detail-value {
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 !important;
                line-height: 1.3 !important;
            }
            .section-title {
                font-size: 18px !important;
                font-weight: 600 !important;
                color: #1e293b !important;
                margin: 0 0 15px 0 !important;
                border-bottom: 2px solid #f1f5f9 !important;
                padding-bottom: 10px !important;
                line-height: 1.3 !important;
            }
            .info-card {
                background-color: #f0f9ff !important;
                border-radius: 8px !important;
                padding: 25px !important;
                margin: 25px 0 !important;
                border: 1px solid #bae6fd !important;
            }
            .info-item {
                margin-bottom: 12px !important;
                line-height: 1.5 !important;
            }
            .info-item:last-child {
                margin-bottom: 0 !important;
            }
            .info-label {
                font-weight: 600 !important;
                color: #0369a1 !important;
                display: inline-block !important;
                width: 120px !important;
            }
            .info-value {
                color: #475569 !important;
            }
            .reminder-card {
                background-color: #fff7ed !important;
                border-radius: 8px !important;
                padding: 25px !important;
                margin: 25px 0 !important;
                border: 1px solid #fdba74 !important;
            }
            .reminder-title {
                font-size: 16px !important;
                font-weight: 600 !important;
                color: #92400e !important;
                margin: 0 0 15px 0 !important;
                display: flex !important;
                align-items: center !important;
            }
            .reminder-icon {
                margin-right: 10px !important;
                font-size: 18px !important;
            }
            .reminder-list {
                list-style: none !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .reminder-list li {
                padding: 8px 0 !important;
                color: #92400e !important;
                font-size: 14.5px !important;
                border-bottom: 1px solid #fed7aa !important;
                display: flex !important;
                align-items: flex-start !important;
                line-height: 1.5 !important;
            }
            .reminder-list li:last-child {
                border-bottom: none !important;
            }
            .reminder-list li:before {
                content: "✓" !important;
                color: #ea580c !important;
                font-weight: bold !important;
                display: inline-block !important;
                width: 20px !important;
                margin-left: -20px !important;
            }
            .app-download-section {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%) !important;
                border-radius: 10px !important;
                padding: 30px !important;
                margin: 35px 0 !important;
                text-align: center !important;
                border: 2px solid #fbbf24 !important;
            }
            .app-title {
                font-size: 18px !important;
                font-weight: 700 !important;
                color: #92400e !important;
                margin: 0 0 15px 0 !important;
            }
            .app-description {
                color: #78350f !important;
                margin: 0 0 20px 0 !important;
                font-size: 15px !important;
                line-height: 1.6 !important;
            }
            .app-buttons {
                display: flex !important;
                justify-content: center !important;
                gap: 15px !important;
                flex-wrap: wrap !important;
                margin-bottom: 20px !important;
            }
            .app-btn {
                display: inline-block !important;
                padding: 12px 25px !important;
                text-decoration: none !important;
                border-radius: 8px !important;
                font-weight: 600 !important;
                font-size: 14px !important;
                transition: transform 0.2s !important;
            }
            .app-btn:hover {
                transform: translateY(-2px) !important;
            }
            .android-btn {
                background-color: #34d399 !important;
                color: white !important;
            }
            .ios-btn {
                background-color: #000000 !important;
                color: white !important;
            }
            .web-link {
                color: #92400e !important;
                font-weight: 600 !important;
                text-decoration: underline !important;
            }
            .footer {
                background-color: #f8fafc !important;
                padding: 25px 40px !important;
                text-align: center !important;
                border-top: 1px solid #e2e8f0 !important;
                color: #64748b !important;
                font-size: 13px !important;
            }
            .footer p {
                margin: 5px 0 !important;
                line-height: 1.5 !important;
            }
            .divider {
                height: 1px !important;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                margin: 30px 0 !important;
            }
            /* FALLBACK FOR OUTLOOK */
            .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {
                line-height: 100% !important;
            }
            /* IOS FIX */
            a[x-apple-data-detectors] {
                color: inherit !important;
                text-decoration: none !important;
                font-size: inherit !important;
                font-family: inherit !important;
                font-weight: inherit !important;
                line-height: inherit !important;
            }
        </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <!--[if (gte mso 9)|(IE)]>
        <table width="600" align="center" cellpadding="0" cellspacing="0" border="0">
        <tr>
        <td>
        <![endif]-->
        
        <div class="container" style="max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
            <div class="header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; padding: 35px 40px; text-align: center; position: relative;">
                <h1 class="logo" style="font-size: 36px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 8px 0; font-family: 'Arial Black', 'Segoe UI', sans-serif;">CLYPS</h1>
                <p class="tagline" style="font-size: 15px; font-weight: 300; opacity: 0.9; margin: 0;">Nueva Cita Asignada</p>
            </div>
            
            <div class="content" style="padding: 40px;">
                <h2 class="greeting" style="font-size: 22px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">Hola ${workerName},</h2>
                
                <p class="message" style="color: #475569; margin: 0 0 30px 0; font-size: 15.5px; line-height: 1.7;">
                    Se te ha asignado una nueva cita. A continuación encontrarás todos los detalles 
                    para que puedas prepararte adecuadamente.
                </p>
                
                <div class="appointment-card" style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; padding: 35px; margin: 35px 0; border: 1px solid #e2e8f0;">
                    <h3 class="appointment-title" style="font-size: 22px; font-weight: 600; color: #059669; text-align: center; margin: 0 0 25px 0;">📅 Detalles de la cita</h3>
                    
                    <div class="appointment-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 0 0 25px 0;">
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">📅</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Fecha</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.date}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">🕐</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Hora</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.time}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">💼</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Servicio</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.serviceName}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">⏱️</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Duración</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.serviceDuration} minutos</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">💰</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Costo</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${this.formatMoney(sessionData.serviceCost, sessionData.serviceCurrency)}</div>
                        </div>
                        
                        <div class="detail-card" style="background-color: #ffffff; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div class="detail-icon" style="font-size: 20px; margin-bottom: 12px; color: #059669;">👤</div>
                            <div class="detail-label" style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Cliente</div>
                            <div class="detail-value" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0;">${sessionData.clientName}</div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px;">
                        <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.5;">
                            📍 Ubicación: <strong>${companyInfo.name}</strong>
                        </p>
                    </div>
                </div>
                
                <h4 class="section-title" style="font-size: 18px; font-weight: 600; color: #1e293b; margin: 0 0 15px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">📋 Información del cliente</h4>
                
                <div class="info-card" style="background-color: #f0f9ff; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #bae6fd;">
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Cliente:</span>
                        <span class="info-value" style="color: #475569;">${clientInfo.name}</span>
                    </div>
                    ${
                      clientInfo.phone
                        ? `
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Teléfono:</span>
                        <span class="info-value" style="color: #475569;">${clientInfo.phone}</span>
                    </div>
                    `
                        : ''
                    }
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Compañía:</span>
                        <span class="info-value" style="color: #475569;">${companyInfo.name}</span>
                    </div>
                    ${
                      companyInfo.address
                        ? `
                    <div class="info-item" style="margin-bottom: 12px; line-height: 1.5;">
                        <span class="info-label" style="font-weight: 600; color: #0369a1; display: inline-block; width: 120px;">Dirección:</span>
                        <span class="info-value" style="color: #475569;">${companyInfo.address}</span>
                    </div>
                    `
                        : ''
                    }
                </div>
                
                <div class="reminder-card" style="background-color: #fff7ed; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #fdba74;">
                    <h4 class="reminder-title" style="font-size: 16px; font-weight: 600; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                        <span class="reminder-icon" style="margin-right: 10px; font-size: 18px;">📌</span>
                        Recordatorios importantes
                    </h4>
                    <ul class="reminder-list" style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">Confirma tu disponibilidad para esta cita</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">Prepara todo lo necesario para el servicio</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; border-bottom: 1px solid #fed7aa; display: flex; align-items: flex-start; line-height: 1.5;">Llega con anticipación a la ubicación</li>
                        <li style="padding: 8px 0; color: #92400e; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Actualiza el estado de la cita en el sistema después del servicio</li>
                    </ul>
                </div>
                
                <!-- SECCIÓN DE DESCARGA DE APP -->
                <div class="app-download-section" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #fbbf24;">
                    <h3 class="app-title" style="font-size: 18px; font-weight: 700; color: #92400e; margin: 0 0 15px 0;">
                        📱 ¡Gestiona tus citas desde tu teléfono!
                    </h3>
                    <p class="app-description" style="color: #78350f; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                        Descarga la app de CLYPS para ver, modificar o gestionar tus citas desde cualquier lugar. 
                        ¡Es mucho más conveniente!
                    </p>
                    <div class="app-buttons" style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px;">
                        <a href="https://play.google.com/store/apps/details?id=com.clyps.app" 
                           class="app-btn android-btn" 
                           style="display: inline-block; background-color: #34d399; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            🟢 Google Play
                        </a>
                        <a href="https://apps.apple.com/app/id1645438827" 
                           class="app-btn ios-btn" 
                           style="display: inline-block; background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                            ⚫ App Store
                        </a>
                    </div>
                    <p style="color: #78350f; font-size: 14px; margin-top: 15px; line-height: 1.5;">
                        O accede desde tu navegador: 
                        <a href="https://app.clyps.com" class="web-link" style="color: #92400e; font-weight: 600; text-decoration: underline;">app.clyps.com</a>
                    </p>
                </div>
                <!-- FIN SECCIÓN DE DESCARGA DE APP -->
                
                <div class="divider" style="height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 30px 0;"></div>
                
                <p style="text-align: center; color: #64748b; font-size: 14px; line-height: 1.6;">
                    Para cualquier modificación en la cita, contacta con el administrador de 
                    <strong>${companyInfo.name}</strong>.
                </p>
            </div>
            
            <div class="footer" style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                <p style="margin: 5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
                <p style="margin: 5px 0;">Sistema de Gestión de Citas Profesional</p>
                <p style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
                    Este es un mensaje automático de notificación, por favor no responder a este correo.
                </p>
            </div>
        </div>
        
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
    </body>
    </html>
  `;
  }

  /**
   * Plantilla para correo de cancelación al cliente
   */
  private getSessionCancellationClientTemplate(
    clientName: string,
    sessionData: { date: string; time: string; reason: string },
    companyInfo: { name: string; email?: string; address?: string },
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cita Cancelada - CLYPS</title>
  <style>
    body { margin:0; padding:0; background:#f8fafc; font-family: 'Segoe UI', Roboto, sans-serif; color:#334155; }
    .container { max-width:580px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); border:1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color:#fff; padding:35px 40px; text-align:center; }
    .logo { font-size:36px; font-weight:700; margin:0 0 8px; }
    .content { padding:40px; }
    .greeting { font-size:22px; font-weight:600; color:#1e293b; margin:0 0 20px; border-bottom:2px solid #f1f5f9; padding-bottom:15px; }
    .message { color:#475569; margin:0 0 30px; font-size:15.5px; line-height:1.7; }
    .cancellation-card { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius:10px; padding:35px; margin:35px 0; border:1px solid #fecaca; text-align:center; }
    .cancellation-title { font-size:22px; font-weight:600; color:#b91c1c; margin:0 0 25px; }
    .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:25px; }
    .detail-card { background:#fff; border-radius:8px; padding:20px; border:1px solid #e2e8f0; }
    .detail-label { font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:1px; font-weight:600; margin-bottom:8px; }
    .detail-value { font-size:18px; font-weight:600; color:#1e293b; }
    .reason-box { background:#fff; border-radius:8px; padding:20px; margin-top:20px; border-left:4px solid #dc2626; text-align:left; }
    .reason-label { font-weight:600; color:#b91c1c; margin-bottom:8px; }
    .reason-text { color:#475569; font-size:15px; line-height:1.6; }
    .footer { background:#f8fafc; padding:25px 40px; text-align:center; color:#64748b; font-size:13px; border-top:1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">CLYPS</h1>
      <p>Cancelación de Cita</p>
    </div>
    <div class="content">
      <h2 class="greeting">Estimado/a ${clientName},</h2>
      <p class="message">
        Lamentamos informarte que tu cita programada ha sido cancelada. 
        A continuación encontrarás los detalles:
      </p>
      <div class="cancellation-card">
        <h3 class="cancellation-title">❌ Cita Cancelada</h3>
        <div class="detail-grid">
          <div class="detail-card">
            <div class="detail-label">📅 Fecha</div>
            <div class="detail-value">${sessionData.date}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">🕐 Hora</div>
            <div class="detail-value">${sessionData.time}</div>
          </div>
        </div>
        <div class="reason-box">
          <div class="reason-label">📝 Motivo de cancelación:</div>
          <div class="reason-text">${sessionData.reason || 'No se especificó motivo.'}</div>
        </div>
      </div>
      <p style="color:#475569; font-size:15px; line-height:1.6;">
        Si deseas reagendar tu cita, puedes hacerlo a través de nuestra app o contactando 
        directamente a <strong>${companyInfo.name}</strong>.
      </p>
      ${companyInfo.email ? `<p style="color:#475569; font-size:14px;">✉️ ${companyInfo.email}</p>` : ''}
      ${companyInfo.address ? `<p style="color:#475569; font-size:14px;">📍 ${companyInfo.address}</p>` : ''}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
      <p style="opacity:0.8;">Sistema de Gestión de Citas Profesional</p>
    </div>
  </div>
</body>
</html>
  `;
  }

  /**
   * Plantilla para correo de cancelación al trabajador
   */
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
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cita Cancelada - CLYPS</title>
  <style>
    body { margin:0; padding:0; background:#f8fafc; font-family: 'Segoe UI', Roboto, sans-serif; color:#334155; }
    .container { max-width:580px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); border:1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color:#fff; padding:35px 40px; text-align:center; }
    .logo { font-size:36px; font-weight:700; margin:0 0 8px; }
    .content { padding:40px; }
    .greeting { font-size:22px; font-weight:600; color:#1e293b; margin:0 0 20px; border-bottom:2px solid #f1f5f9; padding-bottom:15px; }
    .message { color:#475569; margin:0 0 30px; font-size:15.5px; line-height:1.7; }
    .cancellation-card { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius:10px; padding:35px; margin:35px 0; border:1px solid #fecaca; }
    .cancellation-title { font-size:22px; font-weight:600; color:#b91c1c; text-align:center; margin:0 0 25px; }
    .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:25px; }
    .detail-card { background:#fff; border-radius:8px; padding:20px; border:1px solid #e2e8f0; }
    .detail-label { font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:1px; font-weight:600; margin-bottom:8px; }
    .detail-value { font-size:18px; font-weight:600; color:#1e293b; }
    .reason-box { background:#fff; border-radius:8px; padding:20px; margin-top:20px; border-left:4px solid #dc2626; }
    .reason-label { font-weight:600; color:#b91c1c; margin-bottom:8px; }
    .reason-text { color:#475569; font-size:15px; line-height:1.6; }
    .footer { background:#f8fafc; padding:25px 40px; text-align:center; color:#64748b; font-size:13px; border-top:1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">CLYPS</h1>
      <p>Cancelación de Cita</p>
    </div>
    <div class="content">
      <h2 class="greeting">Hola ${workerName},</h2>
      <p class="message">
        Te informamos que una cita que tenías asignada ha sido cancelada.
      </p>
      <div class="cancellation-card">
        <h3 class="cancellation-title">❌ Cita Cancelada</h3>
        <div class="detail-grid">
          <div class="detail-card">
            <div class="detail-label">📅 Fecha</div>
            <div class="detail-value">${sessionData.date}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">🕐 Hora</div>
            <div class="detail-value">${sessionData.time}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">💼 Servicio</div>
            <div class="detail-value">${sessionData.serviceName}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">👤 Cliente</div>
            <div class="detail-value">${sessionData.clientName}</div>
          </div>
        </div>
        <div class="reason-box">
          <div class="reason-label">📝 Motivo de cancelación:</div>
          <div class="reason-text">${sessionData.reason || 'No se especificó motivo.'}</div>
        </div>
      </div>
      <p style="color:#475569; font-size:15px; line-height:1.6;">
        Tu agenda ha sido liberada para esa fecha y hora.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
      <p style="opacity:0.8;">Sistema de Gestión de Citas Profesional</p>
    </div>
  </div>
</body>
</html>
  `;
  }

  private getSessionAdminNotificationTemplate(
    adminName: string,
    sessionData: {
      date: string;
      time: string;
      serviceName: string;
      serviceCost: number;
      serviceCurrency?: string;
      serviceDuration: number;
    },
    clientInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
    workerInfo: {
      name: string;
      email?: string;
      phone?: string;
    },
    companyInfo: {
      name: string;
      address?: string;
      email?: string;
    },
  ): string {
    const amount = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(sessionData.serviceCost) || 0);
    const formattedCost = `${this.currencySymbol(sessionData.serviceCurrency)}${amount}`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nueva cita agendada - CLYPS</title>
  <style>
    body { margin:0; padding:0; background:#f8fafc; font-family: 'Segoe UI', Roboto, sans-serif; color:#334155; }
    .container { max-width:620px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); border:1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color:#fff; padding:35px 40px; text-align:center; }
    .logo { font-size:32px; font-weight:700; margin:0 0 6px; letter-spacing:0.5px; }
    .header-tag { display:inline-block; background:rgba(255,255,255,0.15); color:#fff; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-top:8px; }
    .content { padding:40px; }
    .greeting { font-size:22px; font-weight:600; color:#0f172a; margin:0 0 10px; }
    .intro { color:#475569; margin:0 0 25px; font-size:15px; line-height:1.6; }
    .badge { display:inline-block; background:#dbeafe; color:#1e40af; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; margin-bottom:15px; }
    .summary-card { background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%); border-radius:12px; padding:25px; margin:20px 0 30px; border:1px solid #c7d2fe; text-align:center; }
    .summary-date { font-size:20px; font-weight:700; color:#1e3a8a; margin:0; }
    .summary-time { font-size:32px; font-weight:700; color:#4f46e5; margin:6px 0 0; }
    .section-title { font-size:14px; font-weight:700; color:#1e3a8a; text-transform:uppercase; letter-spacing:1px; margin:30px 0 12px; padding-bottom:8px; border-bottom:2px solid #e0e7ff; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .info-card { background:#f8fafc; border-radius:10px; padding:16px 18px; border:1px solid #e2e8f0; border-left:4px solid #4f46e5; }
    .info-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:1px; font-weight:700; margin-bottom:6px; }
    .info-value { font-size:15px; font-weight:600; color:#0f172a; word-break:break-word; }
    .info-sub { font-size:13px; color:#64748b; margin-top:4px; word-break:break-word; }
    .full-card { background:#f8fafc; border-radius:10px; padding:16px 18px; border:1px solid #e2e8f0; border-left:4px solid #4f46e5; margin-top:14px; }
    .service-box { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius:10px; padding:20px; margin-top:14px; border:1px solid #fcd34d; }
    .service-name { font-size:18px; font-weight:700; color:#78350f; margin:0 0 12px; }
    .service-meta { display:flex; gap:25px; flex-wrap:wrap; font-size:14px; color:#92400e; }
    .service-meta strong { color:#78350f; }
    .footer { background:#f8fafc; padding:25px 40px; text-align:center; color:#64748b; font-size:13px; border-top:1px solid #e2e8f0; }
    .footer p { margin:5px 0; }
    @media screen and (max-width: 600px) {
      .info-grid { grid-template-columns:1fr; }
      .content { padding:25px 20px; }
      .header { padding:25px 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">CLYPS</h1>
      <p style="margin:0; opacity:0.9; font-size:14px;">Panel de Administración</p>
      <span class="header-tag">📋 Notificación interna</span>
    </div>
    <div class="content">
      <span class="badge">Nueva cita agendada</span>
      <h2 class="greeting">Hola ${adminName},</h2>
      <p class="intro">
        Se ha registrado una nueva cita en <strong>${companyInfo.name || 'tu empresa'}</strong>.
        A continuación encontrarás toda la información de la reserva:
      </p>

      <div class="summary-card">
        <p class="summary-date">📅 ${sessionData.date}</p>
        <p class="summary-time">🕐 ${sessionData.time}</p>
      </div>

      <div class="section-title">Servicio</div>
      <div class="service-box">
        <div class="service-name">💼 ${sessionData.serviceName}</div>
        <div class="service-meta">
          <span>💰 <strong>${formattedCost}</strong></span>
          <span>⏱️ <strong>${sessionData.serviceDuration} min</strong></span>
        </div>
      </div>

      <div class="section-title">Cliente</div>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">👤 Nombre</div>
          <div class="info-value">${clientInfo.name || '—'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">📞 Teléfono</div>
          <div class="info-value">${clientInfo.phone || '—'}</div>
        </div>
      </div>
      ${
        clientInfo.email
          ? `
      <div class="full-card">
        <div class="info-label">✉️ Email</div>
        <div class="info-value">${clientInfo.email}</div>
      </div>`
          : ''
      }

      <div class="section-title">Trabajador asignado</div>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">🧑‍💼 Nombre</div>
          <div class="info-value">${workerInfo.name || '—'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">📞 Teléfono</div>
          <div class="info-value">${workerInfo.phone || '—'}</div>
        </div>
      </div>
      ${
        workerInfo.email
          ? `
      <div class="full-card">
        <div class="info-label">✉️ Email</div>
        <div class="info-value">${workerInfo.email}</div>
      </div>`
          : ''
      }

      <div class="section-title">Empresa</div>
      <div class="full-card">
        <div class="info-label">🏢 Nombre</div>
        <div class="info-value">${companyInfo.name || '—'}</div>
        ${companyInfo.address ? `<div class="info-sub">📍 ${companyInfo.address}</div>` : ''}
        ${companyInfo.email ? `<div class="info-sub">✉️ ${companyInfo.email}</div>` : ''}
      </div>
    </div>
    <div class="footer">
      <p>Este correo se envía automáticamente al administrador de la empresa.</p>
      <p>© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
      <p style="opacity:0.8;">Sistema de Gestión de Citas Profesional</p>
    </div>
  </div>
</body>
</html>
  `;
  }
}
