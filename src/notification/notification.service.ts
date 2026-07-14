import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationData,
  NotificationType,
} from './entities/notification.entity';
import { FcmToken, FcmPlatform } from './entities/fcm-token.entity';
import { NotificationReminder } from './entities/notification-reminder.entity';
import { NotificationRealtimeEmitter } from './notification-realtime.emitter';
import { FirebaseService } from './firebase.service';

/** Payload que recibe createNotification (CLYP-260 / §4). */
export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData | null;
  pushTitle?: string;
}

/** Forma de Notification que consume la app (sin la relación `user`). */
export interface NotificationFeedItem {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Notification['data'];
  read: boolean;
  createdAt: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepo: Repository<FcmToken>,
    @InjectRepository(NotificationReminder)
    private readonly reminderRepo: Repository<NotificationReminder>,
    private readonly realtimeEmitter: NotificationRealtimeEmitter,
    private readonly firebase: FirebaseService,
  ) {}

  // ==================== IDEMPOTENCIA CRON (§7) ====================

  /**
   * Reclama un recordatorio de forma atómica (CLYP-263 / §7). Hace INSERT IGNORE
   * sobre notification_reminders; devuelve true si lo reclamó (→ debe enviarse)
   * o false si ya existía (→ omitir). Race-safe ante crons solapados.
   */
  async claimReminder(type: string, referenceId: number): Promise<boolean> {
    const result = await this.reminderRepo.query(
      'INSERT IGNORE INTO `notification_reminders` (`type`, `reference_id`, `sent_at`) VALUES (?, ?, NOW(6))',
      [type, referenceId],
    );
    // mysql2: affectedRows = 1 si insertó, 0 si era duplicado (ignorado).
    return (result?.affectedRows ?? 0) > 0;
  }

  /**
   * Variante RECURRENTE de claim (CLYP-264): permite reenviar el mismo
   * recordatorio si la última vez fue hace más de `intervalDays` días. Útil para
   * "1 mes sin citas", que debe poder repetirse si el cliente sigue inactivo.
   * Devuelve true si corresponde enviar (y actualiza sent_at).
   */
  async claimRecurringReminder(
    type: string,
    referenceId: number,
    intervalDays: number,
  ): Promise<boolean> {
    const recent = await this.reminderRepo.query(
      'SELECT 1 FROM `notification_reminders` WHERE `type` = ? AND `reference_id` = ? AND `sent_at` > (NOW(6) - INTERVAL ? DAY) LIMIT 1',
      [type, referenceId, intervalDays],
    );
    if (recent.length > 0) return false; // enviado recientemente

    await this.reminderRepo.query(
      'INSERT INTO `notification_reminders` (`type`, `reference_id`, `sent_at`) VALUES (?, ?, NOW(6)) ON DUPLICATE KEY UPDATE `sent_at` = NOW(6)',
      [type, referenceId],
    );
    return true;
  }

  // ==================== CREATE (función central §4) ====================

  /**
   * Función CENTRAL por la que pasa TODA notificación (CLYP-260 / §4):
   *   1. inserta la fila en `notifications`,
   *   2. la emite por socket a la room del usuario (app abierta),
   *   3. la envía por push FCM a los dispositivos del usuario (app cerrada).
   *
   * Regla anti-duplicado = Opción B: siempre emite socket Y envía FCM. El
   * cliente deduplica el feed por `id`.
   *
   * El insert es el paso crítico; socket y FCM son best-effort y NUNCA rompen
   * al caller (un evento de dominio no debe fallar por una notificación).
   */
  async createNotification(
    userId: number,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    // §5: `data.type` SIEMPRE debe coincidir con el type de la notificación.
    // Lo forzamos aquí para no depender de que el caller lo recuerde.
    const data: NotificationData | null = input.data
      ? { ...input.data, type: input.type }
      : null;

    const notif = await this.notificationRepo.save(
      this.notificationRepo.create({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data,
        read: false,
      }),
    );

    const feedItem = this.toFeedItem(notif);

    // (a) Tiempo real — best-effort.
    try {
      this.realtimeEmitter.emitCreated(userId, feedItem);
    } catch (error) {
      this.logger.warn(
        `Socket emit falló para notif ${notif.id}: ${this.reason(error)}`,
      );
    }

    // (b) Push externa — best-effort.
    void this.sendPush(userId, input, data);

    return notif;
  }

  /**
   * Fan-out: una notificación POR destinatario (CLYP-260 / §4, nota 🔴).
   * Itera la lista de userIds (únicos) y crea una fila por cada uno.
   */
  async createNotificationForUsers(
    userIds: Array<number | null | undefined>,
    input: CreateNotificationInput,
  ): Promise<void> {
    const unique = [...new Set(userIds.filter((id): id is number => !!id))];
    for (const userId of unique) {
      try {
        await this.createNotification(userId, input);
      } catch (error) {
        this.logger.warn(
          `No se pudo crear notificación para user ${userId}: ${this.reason(error)}`,
        );
      }
    }
  }

  // ==================== PUSH FCM ====================

  /**
   * Envía push a todos los tokens del usuario. No-op si FCM está deshabilitado
   * o el usuario no tiene tokens. Limpia los tokens inválidos (UNREGISTERED).
   */
  private async sendPush(
    userId: number,
    input: CreateNotificationInput,
    data: NotificationData | null,
  ): Promise<void> {
    try {
      const messaging = this.firebase.messaging();
      if (!messaging) return; // FCM deshabilitado (sin credencial).

      const rows = await this.fcmTokenRepo.find({ where: { userId } });
      const tokens = rows.map((r) => r.token);
      if (tokens.length === 0) return;

      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: input.pushTitle ?? input.title,
          body: input.body,
        },
        data: this.stringifyValues(data),
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
        // El push web abre la app; la navegación la decide el Service Worker
        // leyendo `data` (mismo mapa de §5 que usa la app móvil). El backend no
        // hardcodea rutas web: una sola fuente de verdad (el payload `data`).
        webpush: { fcmOptions: { link: '/' } },
      });

      await this.handleInvalidTokens(tokens, response);
    } catch (error) {
      this.logger.warn(
        `Envío FCM falló para user ${userId}: ${this.reason(error)}`,
      );
    }
  }

  /**
   * Elimina de `fcm_tokens` los tokens que FCM reporta como no registrados
   * (messaging/registration-token-not-registered → UNREGISTERED).
   */
  private async handleInvalidTokens(
    tokens: string[],
    response: import('firebase-admin/messaging').BatchResponse,
  ): Promise<void> {
    // Códigos por-token que indican que el token ya no sirve y debe borrarse:
    // - UNREGISTERED: app desinstalada / token rotado.
    // - invalid-registration-token / invalid-argument: token mal formado o basura.
    const invalidCodes = new Set([
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
    ]);
    const invalid: string[] = [];
    response.responses.forEach((res, i) => {
      const code = res.error?.code;
      if (code && invalidCodes.has(code)) {
        invalid.push(tokens[i]);
      }
    });
    if (invalid.length > 0) {
      await this.fcmTokenRepo.delete(invalid.map((token) => ({ token })));
      this.logger.log(`Eliminados ${invalid.length} token(s) FCM inválido(s)`);
    }
  }

  /** FCM exige que todos los values de `data` sean strings. */
  private stringifyValues(
    data: NotificationData | null | undefined,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (!data) return out;
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      out[key] = typeof value === 'string' ? value : String(value);
    }
    return out;
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : 'desconocido';
  }

  // ==================== FEED ====================

  /** Feed paginado del usuario, más recientes primero (createdAt DESC). */
  async findFeed(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{
    items: NotificationFeedItem[];
    page: number;
    limit: number;
    total: number;
  }> {
    const [rows, total] = await this.notificationRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map((n) => this.toFeedItem(n)),
      page,
      limit,
      total,
    };
  }

  /** Cantidad de no leídas del usuario. */
  async getUnreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({
      where: { userId, read: false },
    });
    return { count };
  }

  /** Marca UNA como leída; valida que sea del usuario. */
  async markRead(userId: number, id: number): Promise<{ success: true }> {
    const notif = await this.notificationRepo.findOne({
      where: { id, userId },
    });
    if (!notif) {
      throw new NotFoundException('Notificación no encontrada');
    }
    if (!notif.read) {
      notif.read = true;
      await this.notificationRepo.save(notif);
    }
    // Sync de "leído" entre dispositivos del usuario (best-effort).
    try {
      this.realtimeEmitter.emitRead(userId, id);
    } catch {
      /* best-effort */
    }
    return { success: true };
  }

  /** Marca TODAS las del usuario como leídas. */
  async markAllRead(
    userId: number,
  ): Promise<{ success: true; updated: number }> {
    const result = await this.notificationRepo.update(
      { userId, read: false },
      { read: true },
    );
    try {
      this.realtimeEmitter.emitReadAll(userId);
    } catch {
      /* best-effort */
    }
    return { success: true, updated: result.affected ?? 0 };
  }

  // ==================== TOKENS FCM ====================

  /**
   * Upsert por token: si el token ya existe (en cualquier usuario), actualiza
   * su userId/platform; si no, lo crea. `token` es único globalmente.
   */
  async upsertToken(
    userId: number,
    token: string,
    platform: FcmPlatform,
  ): Promise<{ success: true }> {
    const existing = await this.fcmTokenRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      await this.fcmTokenRepo.save(existing);
    } else {
      await this.fcmTokenRepo.save(
        this.fcmTokenRepo.create({ userId, token, platform }),
      );
    }
    return { success: true };
  }

  /** Elimina un token del usuario (logout). */
  async deleteToken(userId: number, token: string): Promise<{ success: true }> {
    await this.fcmTokenRepo.delete({ userId, token });
    return { success: true };
  }

  // ==================== HELPERS ====================

  private toFeedItem(n: Notification): NotificationFeedItem {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    };
  }
}
