import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
  BadRequestException,
  UploadedFile,
  Body,
  Req,
  UseInterceptors,
  Put,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ClientService } from './client.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Client } from './entities/client.entity';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetCompanyAliasDto } from './dto/set-company-alias.dto';
import { FindAllClientsDto } from './dto/find-all-clients.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  /**
   * Endpoint principal para listar los clientes de la compañía.
   *
   * Lo usan ADMIN y TRABAJADOR (ambos necesitan poder agendarle una cita a
   * cualquier cliente de la empresa, no solo a los que ya atendieron):
   *  - admin:  la compañía se resuelve por las compañías que POSEE.
   *  - worker: la compañía se resuelve por su membresía ACTIVA (company_worker).
   * En ambos casos se devuelven los clientes de esa(s) compañía(s) más los que
   * el propio usuario haya creado, con la misma forma de respuesta y paginación.
   */
  @Get('admin/companies')
  @Roles('adm', 'wrk')
  @UseGuards(RolesGuard)
  async findAllByAdminCompanies(
    @Request() req: AuthenticatedRequest,
    @Query() paginationDto: FindAllClientsDto,
  ) {
    // Extraer userId del token JWT (soporta tanto 'id' como 'sub')
    const userId = req.user.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }

    return await this.clientService.findAllByAdminCompanies(
      userId,
      paginationDto,
      req.user?.userType,
    );
  }

  /**
   * Actualizar perfil del cliente autenticado (con foto opcional)
   * Ruta y lógica idéntica a WorkerController
   */
  @Put('profile/update-with-photo')
  @Roles('cli') // Solo usuarios tipo cliente
  @UseInterceptors(FileInterceptor('photo'))
  async updateProfileWithPhoto(
    @Req() req: AuthenticatedRequest,
    @Body() updateClientDto: UpdateClientDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ): Promise<Client> {
    const userId = req.user.sub;

    // Validar que al menos un campo o la foto sea enviado
    const hasUpdates = Object.keys(updateClientDto).some(
      (key) => updateClientDto[key] !== undefined,
    );
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException(
        'Debe proporcionar al menos un campo para actualizar',
      );
    }

    // Delegar toda la lógica al servicio
    return this.clientService.updateProfileWithPhoto(
      userId,
      updateClientDto,
      photoFile,
    );
  }

  @Get('profile')
  @Roles('cli') // Solo usuarios tipo cliente
  async getProfile(@Req() req: AuthenticatedRequest): Promise<any> {
    const userId = req.user.sub;
    if (!userId) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.clientService.findByUserId(userId);
  }

  /**
   * Ver perfil de un cliente por ID (solo administradores)
   * GET /clients/admin/:clientId/profile
   */
  @Get('admin/:clientId/profile')
  @Roles('adm', 'wrk')
  @UseGuards(RolesGuard)
  async getClientProfileByAdmin(
    @Request() req: AuthenticatedRequest,
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<any> {
    return this.clientService.findByClientId(
      clientId,
      req.user.sub,
      req.user?.userType,
    );
  }

  /**
   * Actualizar perfil de un cliente por ID (solo administradores)
   * PUT /clients/admin/:clientId/update
   */
  @Put('admin/:clientId/update')
  @Roles('adm', 'wrk')
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor('photo'))
  async updateClientProfileByAdmin(
    @Request() req: AuthenticatedRequest,
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() updateClientDto: UpdateClientDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ): Promise<any> {
    const hasUpdates = Object.keys(updateClientDto).some(
      (key) => updateClientDto[key] !== undefined,
    );
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException(
        'Debe proporcionar al menos un campo para actualizar',
      );
    }
    return this.clientService.updateClientByAdmin(
      clientId,
      updateClientDto,
      photoFile,
      req.user.sub,
      req.user?.userType,
      // Compañía activa del token: acota el toggle "Activo" a ESE salón.
      req.user?.companyId ?? null,
    );
  }

  /**
   * Asignar/actualizar el alias que la compañía del admin le da a un cliente.
   * Cada compañía mantiene su propio alias sin pisar el de otras.
   * Enviar alias vacío ("") elimina el alias de esa compañía.
   * PUT /clients/admin/:clientId/alias
   */
  @Put('admin/:clientId/alias')
  @Roles('adm')
  @UseGuards(RolesGuard)
  async setClientAlias(
    @Request() req: AuthenticatedRequest,
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() setCompanyAliasDto: SetCompanyAliasDto,
  ): Promise<Client> {
    const adminId = req.user.sub;
    if (!adminId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }
    return this.clientService.setCompanyAlias(
      adminId,
      clientId,
      setCompanyAliasDto,
    );
  }
}
