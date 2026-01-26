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
          <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
              .container { background-color: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
              .code { font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; margin: 20px 0; }
              .expiry { color: #666; font-size: 14px; text-align: center; }
          </style>
      </head>
      <body>
          <div class="container">
              <h2>Hola ${username},</h2>
              <p>Gracias por registrarte. Usa el siguiente código para verificar tu cuenta:</p>
              <div class="code">${code}</div>
              <p class="expiry">Este código expira en 15 minutos</p>
              <p>Si no solicitaste este código, puedes ignorar este mensaje.</p>
          </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(username: string, code: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
              .container { background-color: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
              .code { font-size: 32px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; }
              .expiry { color: #666; font-size: 14px; text-align: center; }
              .warning { color: #dc2626; font-weight: bold; }
          </style>
      </head>
      <body>
          <div class="container">
              <h2>Hola ${username},</h2>
              <p>Has solicitado restablecer tu contraseña.</p>
              <p>Usa el siguiente código para continuar:</p>
              <div class="code">${code}</div>
              <p class="expiry">Este código expira en 15 minutos</p>
              <p class="warning">Si no solicitaste este cambio, por favor ignora este mensaje y asegura tu cuenta.</p>
          </div>
      </body>
      </html>
    `;
  }

  private getPasswordChangedEmailTemplate(username: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
              .container { background-color: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
              .success { color: #059669; font-weight: bold; }
              .info { color: #666; font-size: 12px; }
          </style>
      </head>
      <body>
          <div class="container">
              <h2>Hola ${username},</h2>
              <p class="success">Tu contraseña ha sido cambiada exitosamente.</p>
              <p>Si realizaste este cambio, no necesitas hacer nada más.</p>
              <p class="info">Fecha y hora del cambio: ${new Date().toLocaleString()}</p>
              <p class="info">Si no realizaste este cambio, por favor contacta con nuestro equipo de soporte inmediatamente.</p>
          </div>
      </body>
      </html>
    `;
  }
}