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
import { WorkerFeedbackService } from './worker_feedback.service';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workerfeedbacks')
export class WorkerFeedbackController {
  constructor(private readonly workerFeedbackService: WorkerFeedbackService) {}

  // Listar todos (opcional)
  @Get()
  async findAll(): Promise<WorkerFeedback[]> {
    return this.workerFeedbackService.findAll();
  }

  // Obtener uno por id
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<WorkerFeedback> {
    return this.workerFeedbackService.findOne(id);
  }

  /**
   * Crear feedback para un worker (autenticado)
   * POST /workerfeedbacks/worker/:workerId
   * Body: { stars, description }
   * clientId se toma del JWT (req.user.sub)
   */
  @Post('worker/:workerId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createForWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Body() createDto: CreateWorkerFeedbackDto,
    @Req() req: any,
  ): Promise<WorkerFeedback> {
    const clientId = req.user?.sub;
    return this.workerFeedbackService.create(createDto, workerId, clientId);
  }

  /**
   * Listar feedbacks de un worker paginados
   * GET /workerfeedbacks/worker/:workerId?page=1&limit=10
   */
  @Get('worker/:workerId')
  @HttpCode(HttpStatus.OK)
  async findByWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: WorkerFeedback[]; meta: any }> {
    const p = page ? parseInt(page, 10) || 1 : 1;
    const l = limit ? parseInt(limit, 10) || 10 : 10;
    return this.workerFeedbackService.findByWorker(workerId, p, l);
  }

  // Actualizar (solo autor o admin)
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateWorkerFeedbackDto,
    @Req() req: any,
  ): Promise<WorkerFeedback> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    return this.workerFeedbackService.update(id, updateDto, requesterUserId, requesterUserType);
  }

  // Eliminar (solo autor o admin)
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any): Promise<{ message: string }> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    await this.workerFeedbackService.remove(id, requesterUserId, requesterUserType);
    return { message: 'Feedback eliminado correctamente' };
  }


  
}
