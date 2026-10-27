import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateCashClosingDto } from './dto/create-cash-closing.dto';
import { RevertCashClosingDto } from './dto/revert-cash-closing.dto';
import {
  PreviewCashClosingDto,
  QueryCashClosingsDto,
} from './dto/query-cash-closings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubscriptionAccessGuard } from '../subscription/guards/subscription-access.guard';
import { RequiresOperationalSubscription } from '../subscription/guards/requires-feature.decorator';

@Controller('cash-closings')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionAccessGuard)
@Roles('adm')
@RequiresOperationalSubscription()
export class CashClosingController {
  constructor(private readonly cashClosingService: CashClosingService) {}

  @Get('preview')
  preview(
    @Req() req: AuthenticatedRequest,
    @Query() query: PreviewCashClosingDto,
  ) {
    return this.cashClosingService.preview(req.user.sub, query.date);
  }

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryCashClosingsDto,
  ) {
    return this.cashClosingService.findAll(
      req.user.sub,
      query.from,
      query.to,
      query.includeReverted ?? true,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashClosingService.findOne(id, req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCashClosingDto, @Req() req: AuthenticatedRequest) {
    return this.cashClosingService.create(req.user.sub, dto);
  }

  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  revert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevertCashClosingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cashClosingService.revert(id, req.user.sub, dto.reason);
  }
}
