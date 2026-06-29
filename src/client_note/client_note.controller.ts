import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClientNoteService } from './client_note.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClientNote } from './entities/client_note.entity';
import { CreateClientNoteDto } from './dto/create-client_note.dto';
import { UpdateClientNoteDto } from './dto/update-client_note.dto';

/**
 * Notas (calificación de texto) que los admin escriben sobre los clientes.
 * Todos los admin ven todas las notas de un cliente; cada admin sólo puede
 * modificar/eliminar las que él creó. Endpoints exclusivos de rol admin.
 */
@Controller('client-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientNoteController {
  constructor(private readonly clientNoteService: ClientNoteService) {}

  /** Crear nota del admin autenticado sobre un cliente. */
  @Post()
  @Roles('adm')
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateClientNoteDto,
  ): Promise<ClientNote> {
    const adminUserId = this.requireAdminId(req);
    return this.clientNoteService.create(adminUserId, req.user.companyId, dto);
  }

  /** Listar todas las notas de un cliente (de cualquier compañía). */
  @Get('client/:clientId')
  @Roles('adm')
  async findByClient(
    @Req() req: AuthenticatedRequest,
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<ClientNote[]> {
    const adminUserId = this.requireAdminId(req);
    return this.clientNoteService.findByClient(clientId, adminUserId);
  }

  /** Actualizar una nota propia. */
  @Put(':id')
  @Roles('adm')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientNoteDto,
  ): Promise<ClientNote> {
    const adminUserId = this.requireAdminId(req);
    return this.clientNoteService.update(id, adminUserId, dto);
  }

  /** Eliminar una nota propia. */
  @Delete(':id')
  @Roles('adm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const adminUserId = this.requireAdminId(req);
    return this.clientNoteService.remove(id, adminUserId);
  }

  private requireAdminId(req: AuthenticatedRequest): number {
    const adminUserId = req.user?.sub;
    if (!adminUserId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }
    return adminUserId;
  }
}
