import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  initializeApp,
  getApps,
  cert,
  App,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

/**
 * Inicializa Firebase Admin SDK para envío de push (FCM) — CLYP-260 / §4.
 *
 * La credencial (service account JSON de `clyps-app`) se lee de la env var
 * `FIREBASE_CREDENTIALS_BASE64`, que acepta:
 *   - el JSON codificado en base64 (recomendado para evitar problemas de escape), o
 *   - el JSON crudo en una línea.
 *
 * Si la env var NO está definida, el service queda DESHABILITADO (no-op): el
 * backend sigue funcionando con socket-only y nunca rompe por falta de credencial.
 * La credencial es secreta y NUNCA va al repo.
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const raw = this.configService.get<string>('FIREBASE_CREDENTIALS_BASE64');
    if (!raw || !raw.trim()) {
      this.logger.warn(
        'FIREBASE_CREDENTIALS_BASE64 no definido: push FCM deshabilitado (solo socket). ' +
          'Define la env var con la service account de clyps-app para habilitar push.',
      );
      return;
    }

    try {
      const serviceAccount = this.parseCredential(raw);
      // Evita re-inicializar si ya existe (hot-reload / múltiples imports).
      const existing = getApps();
      this.app =
        existing.length > 0
          ? existing[0]
          : initializeApp({
              credential: cert(serviceAccount as ServiceAccount),
            });
      this.logger.log('Firebase Admin SDK inicializado (push FCM habilitado)');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.error(
        `No se pudo inicializar Firebase Admin SDK: ${reason}. Push FCM deshabilitado.`,
      );
      this.app = null;
    }
  }

  /** ¿Está el push FCM habilitado (credencial cargada correctamente)? */
  get enabled(): boolean {
    return this.app !== null;
  }

  /** Instancia de messaging, o null si está deshabilitado. */
  messaging(): Messaging | null {
    return this.app ? getMessaging(this.app) : null;
  }

  /** Acepta JSON crudo o base64 del JSON. */
  private parseCredential(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();
    const text = trimmed.startsWith('{')
      ? trimmed
      : Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(text);
  }
}
