import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';

@Controller('workers')
export class WorkerController {
  constructor(private readonly WorkerService: WorkerService) {}

  @Get()
  async findAll(): Promise<Worker[]> {
    return this.WorkerService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Worker> {
    return this.WorkerService.findOne(id);
  }

  @Post()
  async create(@Body() createWorkerDto: CreateWorkerDto): Promise<Worker> {
    return this.WorkerService.create(createWorkerDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkerDto: UpdateWorkerDto,
  ): Promise<Worker> {
    return this.WorkerService.update(id, updateWorkerDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.WorkerService.remove(id);
  }
}
