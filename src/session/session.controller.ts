import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  Put,
  BadRequestException,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { UpdateDetailStatusDto } from './dto/update-detail-status.dto';
import { AddExtraServicesDto } from './dto/add-extra-services.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { AssignWorkersToSessionDto } from './dto/assign-workers-to-session.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { ConfirmAttendanceDto } from './dto/confirm-attendance.dto';
import { SessionRealtimeEmitter } from './session-realtime.emitter';
import { SessionNotificationEmitter } from './session-notification.emitter';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly realtimeEmitter: SessionRealtimeEmitter,
    private readonly notificationEmitter: SessionNotificationEmitter,
  ) {}

  @Post()
  @Roles('adm')
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createSessionDto: CreateSessionDto,
  ) {
    const adminId = req.user.sub;
    return this.sessionService.create(createSessionDto, adminId);
  }

  @Post('create-with-detail')
  @Roles('adm')
  async createSessionWithDetail(
    @Request() req: AuthenticatedRequest,
    @Body() createSessionWithDetailDto: CreateSessionWithDetailDto,
  ) {
    const adminId = req.user.sub;
    const result = await this.sessionService.createSessionWithDetail(
      createSessionWithDetailDto,
      adminId,
    );
    await this.emitCreatedFrom(result, adminId);
    return result;
  }

  /**
   * Devuelve los rangos ocupados de una compañía en un día, sin datos
   * personales de otros clientes. Pensado para que el rol cliente pueda
   * bloquear en el front los slots ya tomados.
   *
   * IMPORTANTE: debe declararse antes de `@Get(':id')` para que el segmento
   * `availability` no sea capturado como parámetro `id`.
   */
  @Get('availability')
  @Roles('cli', 'adm', 'wrk')
  async getAvailability(@Query() getAvailabilityDto: GetAvailabilityDto) {
    return this.sessionService.getAvailability(getAvailabilityDto);
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
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    return this.sessionService.getSessionDetailsWithValidation(
      +id,
      userId,
      userRole,
    );
  }

  @Get()
  @Roles('adm')
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() getSessionsDto: GetSessionsDto,
  ) {
    const adminId = req.user.sub;
    return this.sessionService.findAllSessionsSimple(adminId, getSessionsDto);
  }

  /**
   * Obtiene todas las citas de una compañía específica.
   * Accesible para administradores y clientes (clientes solo si están
   * asociados a la compañía vía `client.companies`).
   */
  @Get('by-company/:companyId')
  @Roles('adm', 'cli')
  async findAllByCompany(
    @Request() req: AuthenticatedRequest,
    @Param('companyId') companyId: string,
    @Query() getSessionsDto: GetSessionsDto,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    return this.sessionService.findAllSessionsByCompany(
      +companyId,
      getSessionsDto,
      userId,
      userRole,
    );
  }

  @Patch(':id')
  @Roles('adm')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto,
  ) {
    const adminId = req.user.sub;
    return this.sessionService.updateSessionDates(
      +id,
      updateSessionDto,
      adminId,
    );
  }

  /**
   * Cambia el estado de la cita completa. Solo administradores.
   * Los trabajadores NO usan este endpoint: ellos cambian el estado de SU
   * servicio vía `PUT details/:detailId/status` y la cita se recalcula sola.
   */
  @Put(':id/status')
  @Roles('adm')
  async updateSessionStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() updateSessionStatusDto: UpdateSessionStatusDto,
  ) {
    const adminId = req.user.sub;
    const result = await this.sessionService.updateSessionStatus(
      +id,
      updateSessionStatusDto,
      adminId,
      'adm',
    );
    await this.realtimeEmitter.emitStatusChanged(+id);
    await this.notificationEmitter.notifyStatusChanged(+id, adminId);
    return result;
  }

  /**
   * Reasigna uno o varios trabajadores a los detalles de una cita y recalcula
   * los montos correspondientes (totalWorker / totalCompany) de cada detalle
   * afectado, así como el totalTime de la cita. Solo administradores.
   */
  @Patch(':id/assign-workers')
  @Roles('adm')
  async assignWorkersToSession(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() assignWorkersDto: AssignWorkersToSessionDto,
  ) {
    const adminId = req.user.sub;
    const result = await this.sessionService.assignWorkersToSession(
      +id,
      assignWorkersDto,
      adminId,
    );
    await this.realtimeEmitter.emitWorkersAssigned(+id, result?.updates ?? []);
    await this.notificationEmitter.notifyWorkersAssigned(
      +id,
      result?.updates ?? [],
      adminId,
    );
    return result;
  }

  @Put('details/:detailId/status')
  @Roles('adm', 'wrk')
  async updateDetailStatus(
    @Request() req: AuthenticatedRequest,
    @Param('detailId') detailId: string,
    @Body() updateDetailStatusDto: UpdateDetailStatusDto,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    const result = await this.sessionService.updateDetailStatus(
      +detailId,
      updateDetailStatusDto,
      userId,
      userRole,
    );
    const sessionId = result?.validation?.sessionId;
    if (sessionId) {
      await this.realtimeEmitter.emitStatusChanged(sessionId);
      await this.notificationEmitter.notifyStatusChanged(sessionId, userId);
    }
    return result;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionService.removeSessionWithDetails(+id);
  }

  @Get('worker/my-sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('wrk')
  async getMySessions(
    @Request() req: AuthenticatedRequest,
    @Query() getSessionsDto: GetSessionsDto,
  ) {
    // req.user contiene la información del usuario autenticado
    const userId = req.user.sub;
    return await this.sessionService.getSessionsForAuthenticatedWorker(
      userId,
      getSessionsDto,
    );
  }

  @Post('client/create')
  @Roles('cli')
  async createSessionByClient(
    @Request() req: AuthenticatedRequest,
    @Body() createSessionWithDetailDto: CreateSessionWithDetailDto,
  ) {
    const userId = req.user.sub;
    const result = await this.sessionService.createSessionByClient(
      createSessionWithDetailDto,
      userId,
    );
    await this.emitCreatedFrom(result, userId);
    return result;
  }

  @Post(':id/sync-status')
  @Roles('adm')
  async syncSessionStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const adminId = req.user.sub;
    return this.sessionService.syncSessionStatusFromDetails(+id, adminId);
  }

  @Post(':id/extra-services')
  @Roles('adm', 'cli')
  async addExtraServices(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() addExtraServicesDto: AddExtraServicesDto,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    const result = await this.sessionService.addExtraServicesToSession(
      +id,
      addExtraServicesDto,
      userId,
      userRole,
    );
    await this.realtimeEmitter.emitExtraServicesChanged(+id, result?.newTotals);
    return result;
  }

  @Delete(':id/extra-services/:detailId')
  @Roles('adm', 'cli')
  async removeExtraService(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('detailId') detailId: string,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    const result = await this.sessionService.removeExtraServiceFromSession(
      +id,
      +detailId,
      userId,
      userRole,
    );
    await this.realtimeEmitter.emitExtraServicesChanged(+id);
    return result;
  }

  // ============ CANCELACIÓN POR ADMIN ============
  @Patch(':id/cancel')
  @Roles('adm')
  async cancelSessionByAdmin(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() cancelDto?: CancelSessionDto,
  ) {
    const adminId = req.user.sub;
    const result = await this.sessionService.cancelSession(
      +id,
      adminId,
      'adm',
      cancelDto,
    );
    await this.realtimeEmitter.emitCancelled(
      +id,
      result?.session?.cancellationReason ?? cancelDto?.reason ?? null,
      result?.session?.cancelledBy ?? 'adm',
    );
    return result;
  }

  // ============ CONFIRMAR ASISTENCIA (CLIENTE) ============
  @Patch('client/:id/confirm-attendance')
  @Roles('cli')
  async confirmAttendance(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmAttendanceDto,
  ) {
    const userId = req.user.sub;
    const result = await this.sessionService.confirmAttendance(
      +id,
      userId,
      dto.attending,
    );
    // Tiempo real para la UI del staff + notificación a admin/worker.
    await this.realtimeEmitter.emitStatusChanged(+id);
    await this.notificationEmitter.notifyAttendanceResponse(
      +id,
      dto.attending,
      userId,
    );
    return result;
  }

  // ============ CANCELACIÓN POR CLIENTE ============
  @Patch('client/:id/cancel')
  @Roles('cli')
  async cancelSessionByClient(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() cancelDto?: CancelSessionDto,
  ) {
    const userId = req.user.sub;
    const result = await this.sessionService.cancelSession(
      +id,
      userId,
      'cli',
      cancelDto,
    );
    await this.realtimeEmitter.emitCancelled(
      +id,
      result?.session?.cancellationReason ?? cancelDto?.reason ?? null,
      result?.session?.cancelledBy ?? 'cli',
    );
    return result;
  }

  /**
   * Obtiene todas las citas del cliente autenticado.
   * Permite filtros por fecha, estado y paginación.
   */
  @Get('client/my-sessions')
  @Roles('cli')
  async getMySessionsAsClient(
    @Request() req: AuthenticatedRequest,
    @Query() getSessionsDto: GetSessionsDto,
  ) {
    const userId = req.user.sub;
    return this.sessionService.getSessionsForAuthenticatedClient(
      userId,
      getSessionsDto,
    );
  }

  /**
   * Lista paginada de servicios asignados al worker (catálogo service.workers)
   * con contadores históricos agregados.
   * - Worker: ve los suyos (workerId se ignora).
   * - Admin: debe pasar ?workerId=<id>.
   */
  @Get('worker/my-services')
  @Roles('wrk', 'adm')
  async getMyAssignedServices(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('workerId') workerId?: string,
  ) {
    const userId = req.user.sub;
    const userType = req.user?.userType;
    const targetWorkerId = this.resolveTargetWorkerId(userType, workerId);
    const pageNum = page ? Math.max(parseInt(page, 10) || 1, 1) : 1;
    const limitNum = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)
      : 10;
    return this.sessionService.getWorkerAssignedServices(
      userId,
      pageNum,
      limitNum,
      targetWorkerId,
    );
  }

  /**
   * Lista paginada de clientes distintos atendidos por el worker.
   * - Worker: ve los suyos.
   * - Admin: debe pasar ?workerId=<id>.
   */
  @Get('worker/my-clients')
  @Roles('wrk', 'adm')
  async getMyClientsAsWorker(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('workerId') workerId?: string,
  ) {
    const userId = req.user.sub;
    const userType = req.user?.userType;
    const targetWorkerId = this.resolveTargetWorkerId(userType, workerId);
    const pageNum = page ? Math.max(parseInt(page, 10) || 1, 1) : 1;
    const limitNum = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)
      : 10;
    return this.sessionService.getWorkerClients(
      userId,
      pageNum,
      limitNum,
      targetWorkerId,
    );
  }

  /**
   * Historial de citas completadas (status 3/4) o canceladas (status 5).
   * - Worker: ve los suyos.
   * - Admin: debe pasar ?workerId=<id>.
   */
  @Get('worker/my-history')
  @Roles('wrk', 'adm')
  async getMyHistoryAsWorker(
    @Request() req: AuthenticatedRequest,
    @Query() getSessionsDto: GetSessionsDto,
    @Query('workerId') workerId?: string,
  ) {
    const userId = req.user.sub;
    const userType = req.user?.userType;
    const targetWorkerId = this.resolveTargetWorkerId(userType, workerId);
    return this.sessionService.getWorkerHistory(
      userId,
      getSessionsDto,
      targetWorkerId,
    );
  }

  /**
   * Reporte de ingresos por servicio.
   * - Worker: ve los suyos.
   * - Admin: debe pasar ?workerId=<id>.
   * Filtros opcionales: startDate, endDate (ISO).
   */
  @Get('worker/income-report')
  @Roles('wrk', 'adm')
  async getMyIncomeReport(
    @Request() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('workerId') workerId?: string,
  ) {
    const userId = req.user.sub;
    const userType = req.user?.userType;
    const targetWorkerId = this.resolveTargetWorkerId(userType, workerId);
    return this.sessionService.getWorkerIncomeReport(
      userId,
      startDate,
      endDate,
      targetWorkerId,
    );
  }

  /**
   * Emite appointment.created SOLO si realmente se creó una cita nueva.
   * El sessionId se obtiene del primer detalle creado (createdDetails[0]).
   */
  private async emitCreatedFrom(
    result: any,
    actorUserId?: number,
  ): Promise<void> {
    const sessionId = result?.createdDetails?.[0]?.sessionId;
    if (sessionId) {
      await this.realtimeEmitter.emitCreated(sessionId);
      await this.notificationEmitter.notifyCreated(sessionId, actorUserId);
    }
  }

  private resolveTargetWorkerId(
    userType: string | undefined,
    workerIdParam: string | undefined,
  ): number | undefined {
    if (userType === 'adm') {
      const parsed = workerIdParam ? parseInt(workerIdParam, 10) : NaN;
      if (!parsed || isNaN(parsed)) {
        throw new BadRequestException(
          'El parámetro workerId es requerido para administradores',
        );
      }
      return parsed;
    }
    return undefined;
  }
}
