import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  WorkerFeedbackService,
  WorkerFeedbackPaginatedResult,
} from './worker_feedback.service';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationResult } from '../common/utils/pagination.util';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('workerfeedbacks')
@UseGuards(JwtAuthGuard)
export class WorkerFeedbackController {
  constructor(private readonly workerFeedbackService: WorkerFeedbackService) {}

  // =============================================
  //  Crear feedback para un trabajador (cliente)
  // POST /workerfeedbacks/worker/:workerId
  // =============================================
  @Post('worker/:workerId')
  @HttpCode(HttpStatus.CREATED)
  async createForWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Body() createDto: CreateWorkerFeedbackDto,
    @Req() req: any,
  ): Promise<WorkerFeedback> {
    const clientId = req.user?.sub;
    return this.workerFeedbackService.create(createDto, workerId, clientId);
  }
  // =============================================
  //  Listar feedbacks de un trabajador específico (público o privado)
  // GET /workerfeedbacks/worker/:workerId?page=1&limit=10
  // =============================================
  @Get('worker/:workerId')
  @HttpCode(HttpStatus.OK)
  async findByWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Query() paginationDto: PaginationDto, // Type transform y validación automática
  ): Promise<PaginationResult<WorkerFeedback>> {
    return this.workerFeedbackService.findByWorker(
      workerId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // =============================================
  //  (WORKER) Obtener mis propias reseñas
  // GET /workerfeedbacks/me?page=1&limit=10
  // =============================================
  @Get('me')
  @UseGuards(RolesGuard)
  @Roles('wrk')
  @HttpCode(HttpStatus.OK)
  async findMyFeedbacks(
    @Req() req: any,
    @Query() paginationDto: PaginationDto,
  ): Promise<WorkerFeedbackPaginatedResult> {
    const userId = req.user?.sub; // ID del usuario autenticado
    return this.workerFeedbackService.findMyFeedbacks(
      userId,
      paginationDto.page,
      paginationDto.limit,
    );
  }
  // =============================================
  // (ADMIN) Listar feedbacks de los barberos de su compañía
  // GET /workerfeedbacks?page=1&limit=10
  // =============================================
  @Get()
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findAllPaginated(
    @Query() paginationDto: PaginationDto,
    @Req() req: any,
  ): Promise<WorkerFeedbackPaginatedResult> {
    const userId = req.user?.sub; // ID del usuario admin (desde el JWT)
    return this.workerFeedbackService.findAllByAdminCompany(
      userId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // =============================================
  //  Obtener un feedback por ID (cualquier usuario autenticado)
  // GET /workerfeedbacks/:id
  // =============================================

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<WorkerFeedback> {
    return this.workerFeedbackService.findOne(id);
  }

  // =============================================
  //  Actualizar feedback (solo autor o admin)
  // PUT /workerfeedbacks/:id
  // =============================================

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateWorkerFeedbackDto,
    @Req() req: any,
  ): Promise<WorkerFeedback> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    return this.workerFeedbackService.update(
      id,
      updateDto,
      requesterUserId,
      requesterUserType,
    );
  }

  // =============================================
  //  Eliminar feedback (solo autor o admin)
  // DELETE /workerfeedbacks/:id
  // =============================================

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    await this.workerFeedbackService.remove(
      id,
      requesterUserId,
      requesterUserType,
    );
    return { message: 'Feedback eliminado correctamente' };
  }
}
