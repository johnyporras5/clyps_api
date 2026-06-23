import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { FindNotificationsDto } from './dto/find-notifications.dto';

/**
 * Feed de notificaciones del usuario autenticado (CLYP-258 / §2).
 * El `userId` SIEMPRE sale del token JWT (req.user.sub).
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** GET /notifications?page=1&limit=20 → { items, page, limit, total } */
  @Get()
  findFeed(@Req() req: any, @Query() query: FindNotificationsDto) {
    return this.notificationService.findFeed(
      req.user.sub,
      query.page,
      query.limit,
    );
  }

  /** GET /notifications/unread-count → { count } */
  @Get('unread-count')
  unreadCount(@Req() req: any) {
    return this.notificationService.getUnreadCount(req.user.sub);
  }

  /** PATCH /notifications/read-all → marca todas como leídas. */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@Req() req: any) {
    return this.notificationService.markAllRead(req.user.sub);
  }

  /** PATCH /notifications/:id/read → marca una como leída (valida dueño). */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markRead(req.user.sub, id);
  }
}
