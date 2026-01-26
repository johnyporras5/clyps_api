import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('RESEND_API_KEY');
    const domain = this.configService.get('RESEND_DOMAIN', 'example.com');
    
    if (!apiKey) {
      this.logger.error('RESEND_API_KEY no está configurada en las variables de entorno');
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get('RESEND_FROM_EMAIL', `Your App <no-reply@${domain}>`);
    this.logger.log(`Resend inicializado correctamente con dominio: ${domain}`);
  }

  async sendVerificationCode(email: string, code: string, username: string): Promise<boolean> {
    return this.sendCodeEmail(email, code, username, 'Verifica tu cuenta', this.getVerificationEmailTemplate(username, code));
  }

  async sendPasswordResetCode(email: string, code: string, username: string): Promise<boolean> {
    return this.sendCodeEmail(email, code, username, 'Restablecer contraseña', this.getPasswordResetEmailTemplate(username, code));
  }

  private async sendCodeEmail(email: string, code: string, username: string, subject: string, html: string): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error('Resend no está inicializado. Verifica RESEND_API_KEY');
        return false;
      }

      this.logger.log(`Enviando código ${code} a ${email}`);

      const { data, error } = await this.resend.emails.send({
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

  async sendPasswordChangedNotification(email: string, username: string): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error('Resend no está inicializado. Verifica RESEND_API_KEY');
        return false;
      }

      this.logger.log(`Enviando notificación de cambio de contraseña a ${email}`);

      const { data, error } = await this.resend.emails.send({
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
                  
                  <p class="message" style="color: #475569; margin: 0 0 30px 0; font-size: 15.5px; line-height: 1.7;">
                      Ingrese este código en la aplicación para activar su cuenta y acceder 
                      al panel de control de CLYPS.
                  </p>
                  
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

  private getPasswordResetEmailTemplate(username: string, code: string): string {
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
                  
                  <div class="steps-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0;">
                      <div class="step" style="background-color: #f8fafc; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0;">
                          <div class="step-number" style="display: inline-block; background-color: #dc2626; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px; margin-bottom: 15px;">1</div>
                          <h4 class="step-title" style="font-weight: 600; color: #1e293b; margin: 0 0 8px 0; font-size: 15px;">Ingrese el Código</h4>
                          <p class="step-description" style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0;">Copie el código anterior e ingréselo en la aplicación CLYPS.</p>
                      </div>
                      
                      <div class="step" style="background-color: #f8fafc; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0;">
                          <div class="step-number" style="display: inline-block; background-color: #dc2626; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; font-size: 14px; margin-bottom: 15px;">2</div>
                          <h4 class="step-title" style="font-weight: 600; color: #1e293b; margin: 0 0 8px 0; font-size: 15px;">Establezca Nueva Contraseña</h4>
                          <p class="step-description" style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0;">Cree una nueva contraseña segura para su cuenta.</p>
                      </div>
                  </div>
                  
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
                          minute: '2-digit'
                      })}
                  </div>
                  
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

  async sendWorkerCredentials(email: string, username: string, password: string): Promise<boolean> {
    return this.sendCredentialsEmail(email, username, password, 'Bienvenido a CLYPS - Tus Credenciales de Acceso', this.getWorkerCredentialsTemplate(username, password));
  }

  private async sendCredentialsEmail(email: string, username: string, password: string, subject: string, html: string): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.error('Resend no está inicializado. Verifica RESEND_API_KEY');
        return false;
      }

      this.logger.log(`Enviando credenciales a ${email}`);

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html,
      });

      if (error) {
        this.logger.error('Error de Resend:', error);
        return false;
      }

      this.logger.log(`✅ Credenciales enviadas exitosamente a ${email}`);
      return true;
    } catch (error) {
      this.logger.error('Error inesperado enviando credenciales:', error);
      return false;
    }
  }

  private getWorkerCredentialsTemplate(username: string, password: string): string {
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
                  <div class="welcome-section" style="padding: 40px; text-align: center;">
                      <h2 class="greeting" style="font-size: 24px; font-weight: 600; color: #1e293b; margin: 0 0 20px 0;">Estimado/a ${username},</h2>
                      <p class="welcome-message" style="color: #475569; margin: 0 0 30px 0; font-size: 16px; line-height: 1.7; max-width: 500px; margin-left: auto; margin-right: auto;">
                          Nos complace darle la bienvenida a CLYPS, la plataforma líder en gestión de citas. 
                          Su cuenta de colaborador ha sido creada exitosamente y estamos encantados de tenerle en nuestro equipo.
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
                                  Acceda al sistema utilizando las credenciales proporcionadas arriba. 
                                  Le recomendamos utilizar el navegador Chrome o Firefox para una mejor experiencia.
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
                                  Complete su perfil profesional con su información personal, especialidades 
                                  y horarios de disponibilidad para comenzar a recibir citas.
                              </p>
                          </div>
                      </div>
                  </div>
                  
                  <div class="security-section" style="background-color: #fef3c7; padding: 30px 40px; margin: 20px 0; border-top: 1px solid #fcd34d; border-bottom: 1px solid #fcd34d;">
                      <h3 class="security-title" style="font-size: 18px; font-weight: 600; color: #92400e; margin: 0 0 15px 0; display: flex; align-items: center;">
                          <span class="security-icon" style="margin-right: 10px; font-size: 20px;">⚠️</span>
                          Directrices de Seguridad
                      </h3>
                      <ul class="security-list" style="list-style: none; padding: 0; margin: 0;">
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Esta contraseña es temporal y debe ser cambiada inmediatamente después de su primer acceso.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">No comparta sus credenciales con nadie, incluyendo otros miembros del equipo.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Utilice contraseñas diferentes para cada servicio y aplicación.</li>
                          <li style="padding: 8px 0; color: #78350f; font-size: 14.5px; display: flex; align-items: flex-start; line-height: 1.5;">Si detecta actividad sospechosa, contacte inmediatamente con el administrador del sistema.</li>
                      </ul>
                  </div>
                  
                  <div class="support-section" style="padding: 30px 40px; text-align: center;">
                      <p class="support-message" style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                          Nuestro equipo de soporte está disponible para asistirle en cualquier momento. 
                          Si encuentra alguna dificultad durante el proceso de configuración, no dude en contactarnos.
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
}