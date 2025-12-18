import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { WorkerFeedbackService } from './worker_feedback.service';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';

@Controller('workerfeedbacks')
export class WorkerFeedbackController {
  constructor(private readonly WorkerFeedbackService: WorkerFeedbackService) {}

  @Get()
  async findAll(): Promise<WorkerFeedback[]> {
    return this.WorkerFeedbackService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<WorkerFeedback> {
    return this.WorkerFeedbackService.findOne(id);
  }

  @Post()
  async create(@Body() createWorkerFeedbackDto: CreateWorkerFeedbackDto): Promise<WorkerFeedback> {
    return this.WorkerFeedbackService.create(createWorkerFeedbackDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkerFeedbackDto: UpdateWorkerFeedbackDto,
  ): Promise<WorkerFeedback> {
    return this.WorkerFeedbackService.update(id, updateWorkerFeedbackDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.WorkerFeedbackService.remove(id);
  }
}
