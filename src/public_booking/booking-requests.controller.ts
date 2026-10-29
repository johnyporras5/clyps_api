import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { SubscriptionAccessGuard } from '../subscription/guards/subscription-access.guard';
import { RequiresOperationalSubscription } from '../subscription/guards/requires-feature.decorator';
import { BookingRequestsService } from './booking-requests.service';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';
import {
  QueryBookingRequestsDto,
  RejectBookingRequestDto,
} from './dto/booking-requests.dto';

@Controller('booking-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingSettingsController {
  constructor(private readonly bookingRequests: BookingRequestsService) {}

  @Get()
  @Roles('adm', 'wrk')
  get(@Req() req: AuthenticatedRequest) {
    return this.bookingRequests.getSettings(req.user.companyId as number);
  }

  @Put()
  @Roles('adm')
  update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBookingSettingsDto,
  ) {
    return this.bookingRequests.updateSettings(
      req.user.companyId as number,
      dto,
    );
  }
}

@Controller('booking-requests')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionAccessGuard)
@Roles('adm', 'wrk')
export class BookingRequestsController {
  constructor(private readonly bookingRequests: BookingRequestsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryBookingRequestsDto,
  ) {
    return this.bookingRequests.list(req.user, query);
  }

  @Post(':sessionId/approve')
  @HttpCode(HttpStatus.OK)
  @RequiresOperationalSubscription()
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.bookingRequests.approve(req.user, sessionId);
  }

  @Post(':sessionId/reject')
  @HttpCode(HttpStatus.OK)
  @RequiresOperationalSubscription()
  reject(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: RejectBookingRequestDto,
  ) {
    return this.bookingRequests.reject(req.user, sessionId, dto.reason);
  }
}
