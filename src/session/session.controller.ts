import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, Put, } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { UpdateDetailStatusDto } from './dto/update-detail-status.dto';
import { AddExtraServicesDto } from './dto/add-extra-services.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { AssignWorkersToSessionDto } from './dto/assign-workers-to-session.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) { }

  @Post()
  @Roles('adm')
  create(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.create(createSessionDto, adminId);
  }

  @Post('create-with-detail')
  @Roles('adm')
  async createSessionWithDetail(
    @Request() req,
    @Body() createSessionWithDetailDto: CreateSessionWithDetailDto
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.createSessionWithDetail(
      createSessionWithDetailDto,
      adminId
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sessionService.findOneWithDetails(+id);
  }
  /**
    * Obtiene los detalles de una sesión (cita) con validación de permisos.
    * Ahora accesible para administradores, trabajadores y clientes autenticados.
    */
  @Get(':id/details')
  @Roles('adm', 'wrk', 'cli')
  async getSessionDetails(
    @Request() req,
    @Param('id') id: string
  ) {
    const userId = req.user?.id || req.user?.sub;
    const userRole = req.user?.userType;
    return this.sessionService.getSessionDetailsWithValidation(+id, userId, userRole);
  }

  @Get()
  @Roles('adm', 'cli')
  async findAll(
    @Request() req,
    @Query() getSessionsDto: GetSessionsDto
  ) {
    const userId = req.user?.id || req.user?.sub;
    const userRole = req.user?.userType;

    if (userRole === 'cli') {
      return this.sessionService.getSessionsForAuthenticatedClient(userId, getSessionsDto);
    }

    return this.sessionService.findAllSessionsSimple(userId, getSessionsDto);
  }

  @Patch(':id')
  @Roles('adm')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.updateSessionDates(+id, updateSessionDto, adminId);
  }

  @Put(':id/status')
  @Roles('adm')
  async updateSessionStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSessionStatusDto: UpdateSessionStatusDto
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.updateSessionStatus(+id, updateSessionStatusDto, adminId);
  }

  /**
   * Reasigna uno o varios trabajadores a los detalles de una cita y recalcula
   * los montos correspondientes (totalWorker / totalCompany) de cada detalle
   * afectado, así como el totalTime de la cita. Solo administradores.
   */
  @Patch(':id/assign-workers')
  @Roles('adm')
  async assignWorkersToSession(
    @Request() req,
    @Param('id') id: string,
    @Body() assignWorkersDto: AssignWorkersToSessionDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.assignWorkersToSession(+id, assignWorkersDto, adminId);
  }

  @Put('details/:detailId/status')
  @Roles('adm', 'wrk')
  async updateDetailStatus(
    @Request() req,
    @Param('detailId') detailId: string,
    @Body() updateDetailStatusDto: UpdateDetailStatusDto
  ) {
    const userId = req.user?.id || req.user?.sub;
    const userRole = req.user?.userType;
    return this.sessionService.updateDetailStatus(+detailId, updateDetailStatusDto, userId, userRole);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionService.removeSessionWithDetails(+id);
  }


  @Get('worker/my-sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('wrk')

  async getMySessions(
    @Request() req,
    @Query() getSessionsDto: GetSessionsDto
  ) {
    // req.user contiene la información del usuario autenticado
    const userId = req.user.sub;
    return await this.sessionService.getSessionsForAuthenticatedWorker(
      userId,
      getSessionsDto
    );
  }


  @Post('client/create')
  @Roles('cli')
  async createSessionByClient(
    @Request() req,
    @Body() createSessionWithDetailDto: CreateSessionWithDetailDto
  ) {
    const userId = req.user?.id || req.user?.sub;
    return this.sessionService.createSessionByClient(createSessionWithDetailDto, userId);
  }

  @Post(':id/sync-status')
  @Roles('adm')
  async syncSessionStatus(
    @Request() req,
    @Param('id') id: string
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.syncSessionStatusFromDetails(+id, adminId);
  }


  @Post(':id/extra-services')
  @Roles('adm', 'cli')
  async addExtraServices(
    @Request() req,
    @Param('id') id: string,
    @Body() addExtraServicesDto: AddExtraServicesDto
  ) {
    const userId = req.user?.id || req.user?.sub;
    const userRole = req.user?.userType;
    return this.sessionService.addExtraServicesToSession(
      +id,
      addExtraServicesDto,
      userId,
      userRole
    );
  }

  @Delete(':id/extra-services/:detailId')
  @Roles('adm', 'cli')
  async removeExtraService(
    @Request() req,
    @Param('id') id: string,
    @Param('detailId') detailId: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const userRole = req.user?.userType;
    return this.sessionService.removeExtraServiceFromSession(+id, +detailId, userId, userRole);
  }


  // ============ CANCELACIÓN POR ADMIN ============
  @Patch(':id/cancel')
  @Roles('adm')
  async cancelSessionByAdmin(
    @Request() req,
    @Param('id') id: string,
    @Body() cancelDto?: CancelSessionDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.cancelSession(+id, adminId, 'adm', cancelDto);
  }

  // ============ CANCELACIÓN POR CLIENTE ============
  @Patch('client/:id/cancel')
  @Roles('cli')
  async cancelSessionByClient(
    @Request() req,
    @Param('id') id: string,
    @Body() cancelDto?: CancelSessionDto,
  ) {
    const userId = req.user?.id || req.user?.sub;
    return this.sessionService.cancelSession(+id, userId, 'cli', cancelDto);
  }


  /**
 * Obtiene todas las citas del cliente autenticado.
 * Permite filtros por fecha, estado y paginación.
 */
@Get('client/my-sessions')
@Roles('cli')
async getMySessionsAsClient(
  @Request() req,
  @Query() getSessionsDto: GetSessionsDto
) {
  const userId = req.user?.id || req.user?.sub;
  return this.sessionService.getSessionsForAuthenticatedClient(userId, getSessionsDto);
}
}