import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PanelHiddenOwnersService } from './panel-hidden-owners.service';

/**
 * Filas ocultas de la lista "Compañías registradas" del panel (`padm`).
 *
 * `@Roles('padm')` va en CADA método: el RolesGuard lee la metadata del
 * handler, no de la clase (ver `AdminCompaniesController`).
 */
@Controller('admin/panel/hidden-owners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanelHiddenOwnersController {
  constructor(private readonly service: PanelHiddenOwnersService) {}

  @Roles('padm')
  @Get()
  async list(): Promise<{ userIds: number[] }> {
    return { userIds: await this.service.list() };
  }

  @Roles('padm')
  @Post(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    return this.service.hide(userId, req.user.sub);
  }

  @Roles('padm')
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unhide(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    return this.service.unhide(userId, req.user.sub);
  }
}
