import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { WebHandoffService } from './services/web-handoff.service';
import { ExchangeImpersonationTicketDto } from './dto/exchange-impersonation-ticket.dto';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Controller('auth/web-handoff')
export class WebHandoffController {
  constructor(private readonly webHandoff: WebHandoffService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest) {
    return this.webHandoff.create(req.user.sub);
  }

  @Post('exchange')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: ExchangeImpersonationTicketDto) {
    return this.webHandoff.exchange(dto.ticket);
  }
}
