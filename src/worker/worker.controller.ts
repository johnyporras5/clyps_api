import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  UseGuards,
  UnauthorizedException,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { WorkerService } from './worker.service';
import { Worker } from './entities/worker.entity';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { UpdateWorkerByAdminDto } from './dto/update-worker-by-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FindAllWorkersDto } from './dto/find-all-workers.dto';
import { PaginationResult } from '../common/utils/pagination.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { RealtimeService } from '../realtime/realtime.service';
import {
  companyRoom,
  workerRoom,
  companyPublicRoom,
} from '../realtime/rooms';

@Controller('workers')
export class WorkerController {
  constructor(
    private readonly workerService: WorkerService,
    private readonly realtime: RealtimeService,
  ) {}

  // Obtener un worker por ID (cualquier usuario autenticado)
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<Worker> {
    // El usuario solo puede ver su propio perfil, a menos que sea admin
    const userId = req.user.sub;
    const userType = req.user.userType;

    return this.workerService.findOne(id, userId, userType);
  }

  // Actualizar worker (solo el dueño del perfil)
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkerDto: UpdateWorkerDto,
    @Req() req: any,
  ): Promise<Worker> {
    const userId = req.user.sub;
    return this.workerService.update(id, updateWorkerDto, userId);
  }

  // Obtener el perfil del worker autenticado
  @Get('profile/my-profile')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@Req() req: any): Promise<Worker> {
    const userId = req.user.sub;
    const userType = req.user.userType;

    // Asegurarse que el usuario es de tipo 'wrk' (trabajador)
    if (userType !== 'wrk') {
      throw new UnauthorizedException(
        'Solo los trabajadores pueden acceder a este perfil',
      );
    }

    return this.workerService.findByUserId(userId);
  }

  /**
   * Actualizar información completa de un worker por el administrador
   * PUT /workers/admin/:workerId/update
   * Abarca: user, worker y company_worker
   */
  @Put('admin/:workerId/update')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @UseInterceptors(FileInterceptor('photo'))
  async updateWorkerByAdmin(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any,
    @Body() dto: UpdateWorkerByAdminDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ) {
    const adminId = req.user.sub;
    const hasUpdates = Object.keys(dto).some((k) => dto[k] !== undefined);
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException(
        'Debe proporcionar al menos un campo para actualizar',
      );
    }
    const result = await this.workerService.updateWorkerByAdmin(
      workerId,
      adminId,
      dto,
      photoFile,
    );

    // worker.updated (CLYP-246): toda edición del worker por el admin afecta la
    // vista de equipo del admin y la selección de providers del cliente.
    const rosterCompanyId =
      result.companyWorker?.companyId ?? req.user?.companyId ?? null;
    if (rosterCompanyId) {
      this.realtime.emitEntity(
        [companyRoom(rosterCompanyId), companyPublicRoom(rosterCompanyId)],
        {
          type: 'worker.updated',
          entityId: workerId,
          companyId: rosterCompanyId,
          data: result.worker,
        },
      );
    }

    // schedule.worker_updated SOLO si el update incluyó el calendar del worker.
    // + availability.changed para ese worker (CLYP-245).
    if (dto.calendar !== undefined) {
      const companyWorkerId = result.companyWorker?.id;
      const companyId =
        result.companyWorker?.companyId ?? req.user?.companyId ?? null;
      if (companyWorkerId && companyId) {
        this.realtime.emitEntity(
          [
            companyRoom(companyId),
            workerRoom(companyWorkerId),
            companyPublicRoom(companyId),
          ],
          {
            type: 'schedule.worker_updated',
            entityId: companyWorkerId,
            companyId,
            data: {
              companyWorkerId,
              workerId,
              calendar: result.companyWorker?.calendar ?? dto.calendar,
            },
          },
        );
        this.realtime.emitEntity(companyPublicRoom(companyId), {
          type: 'availability.changed',
          entityId: companyId,
          companyId,
          data: { companyId, date: null, companyWorkerIds: [companyWorkerId] },
        });
      }
    }

    return result;
  }

  /**
   * Actualizar perfil del trabajador autenticado con o sin foto
   * PUT /workers/profile/update-with-photo
   * Solo trabajadores
   */
  @Put('profile/update-with-photo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('wrk')
  @UseInterceptors(FileInterceptor('photo'))
  async updateProfileWithPhoto(
    @Req() req: any,
    @Body() updateWorkerDto: UpdateWorkerDto,
    @UploadedFile() photoFile?: Express.Multer.File,
  ): Promise<Worker> {
    const userId = req.user.sub;
    const userType = req.user.userType;

    // Validar que al menos un campo sea proporcionado
    const hasUpdates = Object.keys(updateWorkerDto).some(
      (key) => updateWorkerDto[key] !== undefined,
    );
    if (!hasUpdates && !photoFile) {
      throw new BadRequestException(
        'Debe proporcionar al menos un campo para actualizar',
      );
    }

    return this.workerService.updateProfileWithPhoto(
      userId,
      updateWorkerDto,
      photoFile,
    );
  }
}
