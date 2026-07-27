import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { FeedbacksService } from './feedbacks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Controller('feedbacks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('cli')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  // B2: citas pagadas que el cliente aún puede calificar (una sola petición al
  // arrancar, reemplaza la descarga del historial).
  // GET /feedbacks/pending?limit=5
  @Get('pending')
  @HttpCode(HttpStatus.OK)
  async getPending(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limitRaw?: string,
  ) {
    const parsed = Number(limitRaw);
    const limit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 5;
    return this.feedbacksService.getPending(req.user.sub, limit);
  }

  // B3: el cliente declara que no calificará esa cita. 204, idempotente.
  // POST /feedbacks/sessions/:sessionId/skip
  @Post('sessions/:sessionId/skip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async skip(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<void> {
    await this.feedbacksService.skip(req.user.sub, sessionId);
  }
}
