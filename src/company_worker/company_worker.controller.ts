import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorker } from './entities/company_worker.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';

@Controller('companyworkers')
export class CompanyWorkerController {
  constructor(private readonly CompanyWorkerService: CompanyWorkerService) {}

  @Get()
  async findAll(): Promise<CompanyWorker[]> {
    return this.CompanyWorkerService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<CompanyWorker> {
    return this.CompanyWorkerService.findOne(id);
  }

  @Post()
  async create(@Body() createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    return this.CompanyWorkerService.create(createCompanyWorkerDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyWorkerDto: UpdateCompanyWorkerDto,
  ): Promise<CompanyWorker> {
    return this.CompanyWorkerService.update(id, updateCompanyWorkerDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.CompanyWorkerService.remove(id);
  }
}
