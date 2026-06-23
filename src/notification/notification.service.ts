import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationData,
  NotificationType,
} from './entities/notification.entity';
import { FcmToken, FcmPlatform } from './entities/fcm-token.entity';
import { NotificationRealtimeEmitter } from './notification-realtime.emitter';
import { FirebaseService } from './firebase.service';

/** Payload que recibe createNotification (CLYP-260 / §4). */
export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData | null;
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
    private readonly realtimeEmitter: NotificationRealtimeEmitter,
    private readonly firebase: FirebaseService,
  ) {}

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
        notification: { title: input.title, body: input.body },
        data: this.stringifyValues(data),
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
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
    const notif = await this.notificationRepo.findOne({ where: { id, userId } });
    if (!notif) {
      throw new NotFoundException('Notificación no encontrada');
    }
    if (!notif.read) {
      notif.read = true;
      await this.notificationRepo.save(notif);
    }
    return { success: true };
  }

  /** Marca TODAS las del usuario como leídas. */
  async markAllRead(userId: number): Promise<{ success: true; updated: number }> {
    const result = await this.notificationRepo.update(
      { userId, read: false },
      { read: true },
    );
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
