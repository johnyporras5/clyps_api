import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import {
  CreateContactLogDto,
  UpdateContactLogDto,
} from './dto/contact-log.dto';
import {
  PanelContactsService,
  type ContactLogView,
  type ContactSummaryView,
} from './panel-contacts.service';

/**
 * Historial de contactos con los salones, solo para el panel (`padm`).
 *
 * `@Roles('padm')` va en CADA método: el RolesGuard lee la metadata del
 * handler, no de la clase (ver `PanelHiddenOwnersController`). Sin él,
 * cualquier dueño logueado podría leer las notas que se escriben de su salón
 * y de todos los demás.
 */
@Controller('admin/panel/contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanelContactsController {
  constructor(private readonly service: PanelContactsService) {}

  /** Último contacto y total de cada dueño contactado alguna vez. */
  @Roles('padm')
  @Get()
  async summary(): Promise<{ owners: ContactSummaryView[] }> {
    return { owners: await this.service.summary() };
  }

  @Roles('padm')
  @Get('owners/:userId')
  async history(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<{ entries: ContactLogView[] }> {
    return { entries: await this.service.history(userId) };
  }

  @Roles('padm')
  @Post('owners/:userId')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateContactLogDto,
  ): Promise<ContactLogView> {
    return this.service.create(userId, dto, req.user.sub);
  }

  @Roles('padm')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactLogDto,
  ): Promise<ContactLogView> {
    return this.service.update(id, dto, req.user.sub);
  }

  @Roles('padm')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.service.remove(id, req.user.sub);
  }
}
