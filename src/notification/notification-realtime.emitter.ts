import { Injectable } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { userRoom } from '../realtime/rooms';
import { NotificationFeedItem } from './notification.service';

/**
 * Emisor de tiempo real para notificaciones (CLYP-259 / §3).
 *
 * El socket ya une a cada usuario a su room `user:{userId}` al autenticar el
 * handshake (gateway, CLYP-240). Aquí solo emitimos el evento `notification.created`
 * a esa room. El payload es el MISMO objeto `Notification` que devuelve el feed (§2).
 *
 * Lo invoca `createNotification` (CLYP-260 / §4) justo después de persistir.
 */
@Injectable()
export class NotificationRealtimeEmitter {
  constructor(private readonly realtime: RealtimeService) {}

  /** Emite `notification.created` a la room personal del destinatario. */
  emitCreated(userId: number, notification: NotificationFeedItem): void {
    this.realtime.emitToRooms(
      userRoom(userId),
      'notification.created',
      notification,
    );
  }

  /**
   * Sync de "leído" entre dispositivos (CLYP-264 / opcional). Avisa a TODAS las
   * sesiones del usuario que una notificación se marcó como leída, para que el
   * badge baje en tiempo real sin esperar al refresco.
   */
  emitRead(userId: number, notificationId: number): void {
    this.realtime.emitToRooms(userRoom(userId), 'notification.read', {
      id: notificationId,
    });
  }

  /** Sync de "marcar todas como leídas" entre dispositivos. */
  emitReadAll(userId: number): void {
    this.realtime.emitToRooms(userRoom(userId), 'notification.read_all', {});
  }
}
