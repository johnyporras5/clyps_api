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
import { PaginationDto } from '../common/dto/pagination.dto';
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
   * Endpoint principal para listar clientes según las reglas de visibilidad
   * 
   * Reglas:
   * 1. Clientes PÚBLICOS: Visibles para TODOS los administradores logueados
   * 2. Clientes PRIVADOS: Solo visibles para administradores cuyas compañías 
   *    están en el array 'companies' del cliente
   * 3. Admin sin compañías: Solo puede ver clientes públicos
   */
  @Get('admin/companies')
  async findAllByAdminCompanies(
    @Request() req,
    @Query() paginationDto: FindAllClientsDto,
  ) {
    // Extraer adminId del token JWT (soporta tanto 'id' como 'sub')
    const adminId = req.user?.id || req.user?.sub;

    if (!adminId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }

    return await this.clientService.findAllByAdminCompanies(adminId, paginationDto);
  }


   /**
   * Actualizar perfil del cliente autenticado (con foto opcional)
   * Ruta y lógica idéntica a WorkerController
   */
  @Put('profile/update-with-photo')
  @Roles('cli') // Solo usuarios tipo cliente
  @UseInterceptors(FileInterceptor('photo'))
  async updateProfileWithPhoto(
    @Req() req: any,
    @Body() updateClientDto: UpdateClientDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ): Promise<Client> {
    const userId = req.user?.sub || req.user?.id;
    const userType = req.user?.userType;

    // Validar que al menos un campo o la foto sea enviado
    const hasUpdates = Object.keys(updateClientDto).some(
      (key) => updateClientDto[key] !== undefined,
    );
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException('Debe proporcionar al menos un campo para actualizar');
    }

    // Delegar toda la lógica al servicio
    return this.clientService.updateProfileWithPhoto(userId, updateClientDto, photoFile);
  }


   @Get('profile')
  @Roles('cli') // Solo usuarios tipo cliente
  async getProfile(@Req() req: any): Promise<any> {
    const userId = req.user?.sub || req.user?.id;
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
  @Roles('adm')
  @UseGuards(RolesGuard)
  async getClientProfileByAdmin(
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<any> {
    return this.clientService.findByClientId(clientId);
  }

  /**
   * Actualizar perfil de un cliente por ID (solo administradores)
   * PUT /clients/admin/:clientId/update
   */
  @Put('admin/:clientId/update')
  @Roles('adm')
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor('photo'))
  async updateClientProfileByAdmin(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() updateClientDto: UpdateClientDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ): Promise<any> {
    const hasUpdates = Object.keys(updateClientDto).some(
      (key) => updateClientDto[key] !== undefined,
    );
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException('Debe proporcionar al menos un campo para actualizar');
    }
    return this.clientService.updateClientByAdmin(clientId, updateClientDto, photoFile);
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
    @Request() req,
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() setCompanyAliasDto: SetCompanyAliasDto,
  ): Promise<Client> {
    const adminId = req.user?.id || req.user?.sub;
    if (!adminId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }
    return this.clientService.setCompanyAlias(adminId, clientId, setCompanyAliasDto);
  }

}