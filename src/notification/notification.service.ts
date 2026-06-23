import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { FcmToken, FcmPlatform } from './entities/fcm-token.entity';

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
  ) {}

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
